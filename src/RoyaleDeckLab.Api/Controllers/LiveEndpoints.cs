using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using RoyaleDeckLab.Api.Security;
using RoyaleDeckLab.Api.Services.Stats;

namespace RoyaleDeckLab.Api.Controllers;

/// <summary>
/// The live connections: every open tab holds one to say whether it's in view, and the admin stats page holds one
/// that pushes how many visitors are looking at the site.
/// </summary>
public static class LiveEndpoints
{
    public const string InViewMessage = "v";
    public const string HiddenMessage = "h";
    private const string DevClientOrigin = "localhost:5173";

    private const int MaxAdminWatchers = 5;
    private const int MaxTokenLength = 256;
    private static readonly TimeSpan TokenWait = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan PushEvery = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan CloseWait = TimeSpan.FromSeconds(2);

    private static int _adminWatchers;

    public sealed record LiveCount(int InView);

    public static void MapLiveEndpoints(this WebApplication app)
    {
        app.Map("/api/live", TabAsync).RequireRateLimiting(RateLimitPolicies.Stats);
        app.Map("/api/admin/live", AdminAsync).RequireRateLimiting(RateLimitPolicies.AdminStats);
    }

    private static async Task<IResult> TabAsync(
        HttpContext context, LivePresence presence, StatsRecorder recorder, IHostApplicationLifetime lifetime, IWebHostEnvironment environment)
    {
        if (!context.WebSockets.IsWebSocketRequest || !FromThisSite(context, environment))
        {
            return Results.BadRequest();
        }
        if (recorder.VisitorOf(context) is not { } visitor)
        {
            return Results.StatusCode(StatusCodes.Status403Forbidden);
        }
        if (presence.Join(visitor, RateLimitKey.For(context.Connection.RemoteIpAddress)) is not { } tab)
        {
            return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        try
        {
            using var socket = await context.WebSockets.AcceptWebSocketAsync();
            using var stop = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, lifetime.ApplicationStopping);
            var buffer = new byte[8];
            while (true)
            {
                var message = await ReceiveTextAsync(socket, buffer, stop.Token);
                if (message is not (InViewMessage or HiddenMessage))
                {
                    break;
                }
                presence.SetInView(tab, message == InViewMessage);
            }
            await CloseAsync(socket);
        }
        finally
        {
            presence.Leave(tab);
        }
        return Results.Empty;
    }

    /// <summary>
    /// The admin token comes as the first message rather than in the address, which would end up in logs. A wrong
    /// one and an unset one both close the connection the same way.
    /// </summary>
    private static async Task<IResult> AdminAsync(
        HttpContext context, LivePresence presence, StatsRecorder recorder, StatsStore store, IHostApplicationLifetime lifetime, IWebHostEnvironment environment)
    {
        if (!context.WebSockets.IsWebSocketRequest || !FromThisSite(context, environment))
        {
            return Results.BadRequest();
        }
        if (Interlocked.Increment(ref _adminWatchers) > MaxAdminWatchers)
        {
            Interlocked.Decrement(ref _adminWatchers);
            return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        try
        {
            using var socket = await context.WebSockets.AcceptWebSocketAsync();
            using var stop = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, lifetime.ApplicationStopping);
            if (!await SentAdminTokenAsync(socket, stop.Token))
            {
                await CloseAsync(socket, WebSocketCloseStatus.PolicyViolation);
                return Results.Empty;
            }

            if (recorder.VisitorOf(context) is { } admin)
            {
                presence.Ignore(admin);
                store.Forget(admin);
            }
            await PushInViewAsync(socket, presence, stop.Token);
            await CloseAsync(socket);
        }
        finally
        {
            Interlocked.Decrement(ref _adminWatchers);
        }
        return Results.Empty;
    }

    private static async Task<bool> SentAdminTokenAsync(WebSocket socket, CancellationToken stop)
    {
        using var tokenWait = CancellationTokenSource.CreateLinkedTokenSource(stop);
        tokenWait.CancelAfter(TokenWait);
        var token = await ReceiveTextAsync(socket, new byte[MaxTokenLength], tokenWait.Token);
        var expected = Environment.GetEnvironmentVariable(RequireAdminTokenAttribute.EnvVar);
        if (token is null || string.IsNullOrWhiteSpace(expected))
        {
            return false;
        }
        return RequireAdminTokenAttribute.TokensMatch(token, expected);
    }

    // Sends the count whenever it changes, until the page closes the connection.
    private static async Task PushInViewAsync(WebSocket socket, LivePresence presence, CancellationToken stop)
    {
        var closed = DrainUntilClosedAsync(socket, stop);
        using var timer = new PeriodicTimer(PushEvery);
        var sent = -1;
        while (!closed.IsCompleted)
        {
            var inView = presence.InView;
            if (inView != sent)
            {
                if (!await SendAsync(socket, new LiveCount(inView), stop))
                {
                    break;
                }
                sent = inView;
            }
            await Task.WhenAny(timer.WaitForNextTickAsync(stop).AsTask(), closed);
        }
        await closed;
    }

    // Browsers always send Origin on a WebSocket, so another site's page can't open one here to inflate the count.
    private static bool FromThisSite(HttpContext context, IWebHostEnvironment environment)
    {
        var origin = context.Request.Headers.Origin.ToString();
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
        {
            return false;
        }
        var isSameHost = string.Equals(uri.Authority, context.Request.Host.Value, StringComparison.OrdinalIgnoreCase);
        var isDevClient = environment.IsDevelopment() && uri.Authority == DevClientOrigin;
        return isSameHost || isDevClient;
    }

    /// <summary>
    /// The next text message, or null once the connection ends: closed by the page, dropped, stopped by a shutdown,
    /// or sent a message that doesn't fit the buffer.
    /// </summary>
    private static async Task<string?> ReceiveTextAsync(WebSocket socket, byte[] buffer, CancellationToken ct)
    {
        try
        {
            var result = await socket.ReceiveAsync(buffer, ct);
            var isWholeTextMessage = result.MessageType == WebSocketMessageType.Text && result.EndOfMessage;
            return isWholeTextMessage ? Encoding.UTF8.GetString(buffer, 0, result.Count) : null;
        }
        catch (WebSocketException)
        {
            return null;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return null;
        }
    }

    private static async Task DrainUntilClosedAsync(WebSocket socket, CancellationToken ct)
    {
        var buffer = new byte[16];
        while (await ReceiveTextAsync(socket, buffer, ct) is not null)
        {
        }
    }

    /// <summary>False once the connection is gone.</summary>
    private static async Task<bool> SendAsync(WebSocket socket, LiveCount count, CancellationToken ct)
    {
        try
        {
            var json = JsonSerializer.SerializeToUtf8Bytes(count, JsonSerializerOptions.Web);
            await socket.SendAsync(json, WebSocketMessageType.Text, true, ct);
            return true;
        }
        catch (WebSocketException)
        {
            return false;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return false;
        }
    }

    // A connection that can't be closed politely within a moment is cut.
    private static async Task CloseAsync(WebSocket socket, WebSocketCloseStatus status = WebSocketCloseStatus.NormalClosure)
    {
        if (socket.State is not (WebSocketState.Open or WebSocketState.CloseReceived))
        {
            return;
        }
        using var wait = new CancellationTokenSource(CloseWait);
        try
        {
            await socket.CloseOutputAsync(status, null, wait.Token);
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException)
        {
            socket.Abort();
        }
    }
}
