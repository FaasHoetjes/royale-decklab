using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class BalanceUpdatesTests
{
    private static CardStatsResponse StatsSince(string? since, string? previousSince, bool isLastPatch = false)
        => new(since, null, 1000, isLastPatch, [], previousSince);

    [Fact]
    public void The_shipped_file_loads_newest_first_with_every_change_filled_in()
    {
        Assert.NotEmpty(BalanceUpdates.All);
        Assert.Equal(BalanceUpdates.All.OrderByDescending(u => u.LiveFrom), BalanceUpdates.All);
        Assert.All(BalanceUpdates.All, update =>
        {
            Assert.StartsWith("https://supercell.com/", update.NotesUrl);
            Assert.NotEmpty(update.Changes);
            Assert.All(update.Changes, change =>
            {
                Assert.InRange(change.CardId, 26_000_000, 28_999_999);
                Assert.False(string.IsNullOrWhiteSpace(change.Summary));
            });
        });
    }

    [Fact]
    public void Reads_kinds_and_versions_by_name()
    {
        var update = Assert.Single(BalanceUpdates.Parse("""
            [{ "liveFrom": "2026-10-19", "notesUrl": "https://supercell.com/x", "changes": [
              { "cardId": 26000056, "version": "evo", "kind": "rework", "summary": "Death damage 192 → 163" }
            ] }]
            """));

        Assert.Equal(new DateOnly(2026, 10, 19), update.LiveFrom);
        Assert.Equal(new BalanceChange(26000056, CardVersionKind.Evo, BalanceChangeKind.Rework, "Death damage 192 → 163"), Assert.Single(update.Changes));
    }

    [Fact]
    public void Gives_the_updates_since_the_patch_the_changes_compare_against()
    {
        var updates = BalanceUpdates.During(StatsSince("2026-11-02T09:32:46.298Z", "2026-10-05T09:00:00.000Z"));

        Assert.Equal([new DateOnly(2026, 10, 19), new DateOnly(2026, 10, 6)], updates.Select(u => u.LiveFrom));
    }

    [Fact]
    public void Skips_updates_from_before_that_patch()
        => Assert.Empty(BalanceUpdates.During(StatsSince("2026-12-07T09:00:00.000Z", "2026-11-02T09:32:46.298Z")));

    [Fact]
    public void Without_a_comparison_gives_the_updates_of_the_patch_shown()
        => Assert.Equal(2, BalanceUpdates.During(StatsSince("2026-10-05T09:00:00.000Z", null, isLastPatch: true)).Count);

    [Fact]
    public void Without_a_patch_gives_none()
        => Assert.Empty(BalanceUpdates.During(StatsSince(null, null)));
}
