using Polly.CircuitBreaker;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services.Crawling;

/// <summary>
/// One poll's log reads, at most <paramref name="maxReads"/>. A log that can't be read leaves the poll to the others:
/// the CR API fails single requests now and then. Only a refusing API or a shutdown stops the poll.
/// </summary>
/// <param name="flush">Stores what the harvest holds besides ladder battles, after every <see cref="PlayersPerFlush"/> reads.</param>
public sealed class PlayerPoll<TGroup>(
    ClashRoyaleCrawlClient client,
    LadderIntake ladder,
    PlayerTracker<TGroup> tracker,
    PollHarvest<TGroup> harvest,
    PlayerPollOptions options,
    Func<CancellationToken, Task> flush,
    long nowMs,
    int maxReads = int.MaxValue) where TGroup : struct
{
    private const int PlayersPerFlush = 500;

    private int _reads;

    public int ReadsLeft => Math.Max(0, maxReads - _reads);

    public async Task ReadAsync(IEnumerable<string> tags, CancellationToken ct)
    {
        var batch = tags
            .Where(tag => !harvest.WasRead(tag))
            .Distinct(StringComparer.Ordinal)
            .Take(ReadsLeft)
            .ToList();
        _reads += batch.Count;
        var parallel = new ParallelOptions { MaxDegreeOfParallelism = CrawlConcurrency.MaxRequests, CancellationToken = ct };
        foreach (var chunk in batch.Chunk(PlayersPerFlush))
        {
            try
            {
                await Parallel.ForEachAsync(chunk, parallel, ReadLogAsync);
            }
            finally
            {
                await FlushAsync(ct);
            }
        }
    }

    public async Task FlushAsync(CancellationToken ct)
    {
        await flush(ct);
        harvest.LadderAdded += ladder.Store(harvest.TakePendingLadder());
    }

    public void ReportLadder(string source) => ladder.PruneAndReport(source, harvest.LadderFound, harvest.LadderAdded);

    private async ValueTask ReadLogAsync(string tag, CancellationToken ct)
    {
        harvest.MarkRead(tag);
        try
        {
            var log = await client.GetPlayerBattlelogAsync(tag, ct);
            var (group, seenMs) = harvest.Add(tag, log);
            tracker.RecordRead(tag, log, group, seenMs, nowMs);
        }
        catch (Exception ex) when (ex is not BrokenCircuitException && !ct.IsCancellationRequested)
        {
            harvest.AddFailedRead(ex.GetType().Name);
        }
    }

    public async Task ReadSeedsAsync(IReadOnlyList<string> seeds, CancellationToken ct)
    {
        try
        {
            await ReadAsync(seeds, ct);
        }
        finally
        {
            foreach (var tag in seeds.Where(harvest.WasRead))
            {
                if (harvest.NewestBattleMs(tag) is { } newestBattleMs)
                {
                    tracker.RecordSeedTried(tag, newestBattleMs, nowMs);
                }
                else
                {
                    tracker.RecordSeedFailed(tag, nowMs);
                }
            }
        }
    }

    /// <summary>
    /// The recently online members of <paramref name="clans"/>, asked one at a time so none is asked for once the seeds
    /// are full. A clan whose members didn't all fit, or that couldn't be read, isn't marked tried, so it's asked again
    /// next poll.
    /// </summary>
    public async Task PickClanmatesAsync<TSource>(
        SeedPicks<TSource> seeds, TSource source, IEnumerable<string> clans, CancellationToken ct) where TSource : struct, Enum
    {
        var seenSince = DateTimeOffset.FromUnixTimeMilliseconds(nowMs - options.ClanmateSeenWithinMs);
        foreach (var clan in clans.Where(clan => tracker.IsClanDue(clan, nowMs)).Take(options.ClansPerPoll))
        {
            if (!seeds.HasRoom)
            {
                return;
            }
            if (await ClanMembersAsync(clan, seenSince, ct) is not { } members)
            {
                continue;
            }
            if (!seeds.Pick(source, members.Where(tag => tracker.IsSeedDue(tag, nowMs))))
            {
                return;
            }
            tracker.RecordClanTried(clan, nowMs);
        }
    }

    private async Task<IReadOnlyList<string>?> ClanMembersAsync(string clanTag, DateTimeOffset seenSince, CancellationToken ct)
    {
        try
        {
            return await client.GetActiveClanMemberTagsAsync(clanTag, seenSince, ct);
        }
        catch (Exception ex) when (ex is not BrokenCircuitException && !ct.IsCancellationRequested)
        {
            harvest.AddFailedRead(ex.GetType().Name);
            return null;
        }
    }

    /// <summary>
    /// Reads the new opponents met this poll, up to each group's room, the emptiest groups first when the reads run
    /// out. Their own logs bring in more opponents, so those are followed again in the same poll, for the groups
    /// <paramref name="followsAgain"/> says.
    /// </summary>
    public async Task FollowOpponentsAsync(
        IReadOnlyCollection<string> pinned, Func<TGroup, bool> followsAgain, CancellationToken ct)
    {
        for (var step = 0; step < Math.Max(1, options.OpponentStepsPerPoll) && ReadsLeft > 0; step++)
        {
            var isFirst = step == 0;
            var newOpponents = harvest.Opponents()
                .Where(o => isFirst || followsAgain(o.Group))
                .Where(o => !tracker.IsKnown(o.Tag))
                .GroupBy(o => o.Group)
                .Select(inGroup => (Opponents: inGroup, Room: tracker.RoomIn(inGroup.Key)))
                .OrderByDescending(g => g.Room)
                .SelectMany(g => g.Opponents.Take(g.Room).Select(o => o.Tag))
                .ToList();
            if (newOpponents.Count == 0)
            {
                return;
            }
            await ReadAsync(newOpponents, ct);
            tracker.Trim(pinned);
        }
    }
}
