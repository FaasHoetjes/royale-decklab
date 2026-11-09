using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services.Reminders;

public static class ReminderRegistration
{
    private static readonly TimeSpan DiscordTimeout = TimeSpan.FromSeconds(10);

    public static IServiceCollection AddDiscordReminders(this IServiceCollection services, string dataDirectory)
    {
        services.Configure<ReminderOptions>(o =>
            o.EncryptionKey = Environment.GetEnvironmentVariable(ReminderOptions.EncryptionKeyEnvVar) ?? "");
        services.AddSingleton<WebhookTokenCipher>();
        services.AddSingleton(sp => new ReminderStore(
            Path.Combine(dataDirectory, "reminders.db"),
            sp.GetRequiredService<WebhookTokenCipher>()));

        // No resilience handler: a retried post could land twice, and the reminder job retries next minute anyway.
        services.AddHttpClient<DiscordWebhookClient>(http =>
            {
                http.Timeout = DiscordTimeout;
                http.DefaultRequestHeaders.UserAgent.ParseAdd("RoyaleDeckLab (https://royaledecklab.com)");
            })
            .RemoveAllLoggers();

        services.AddSingleton<DiscordReminderSetup>();
        services.AddHostedService<ReminderService>();
        return services;
    }
}
