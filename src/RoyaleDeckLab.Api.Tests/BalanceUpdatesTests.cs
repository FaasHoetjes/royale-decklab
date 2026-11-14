using System.Runtime.CompilerServices;
using System.Text.Json;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

/// <summary>
/// Read off trimmed copies of the October and September 2026 posts: their headings and card blocks, without
/// Supercell's reasoning.
/// </summary>
public sealed class BalanceUpdatesTests
{
    private const string October = "/en/games/clashroyale/blog/release-notes/october-balance-changes-2026";
    private const string September = "/en/games/clashroyale/blog/release-notes/september-balance-changes-2027";

    private static readonly IReadOnlyList<CatalogCard> Cards = JsonSerializer
        .Deserialize<List<NamedCard>>(File.ReadAllText(Fixture("balance-post-cards.json")), JsonSerializerOptions.Web)!
        .Select(c => new CatalogCard(c.Id, c.Name, 16, null, null, null, null))
        .ToList();

    private sealed record NamedCard(int Id, string Name);

    private static string Fixture(string name, [CallerFilePath] string thisFile = "")
        => Path.Combine(Path.GetDirectoryName(thisFile)!, "Fixtures", name);

    private static IReadOnlyList<PostedUpdate> Read(string fixture, string path, string published)
        => PatchNotes.ParseUpdates(File.ReadAllText(Fixture(fixture)), new BlogPost("Balance Changes", path, DateTimeOffset.Parse(published)));

    private static IReadOnlyList<PostedUpdate> ReadOctober() => Read("balance-post-october-2026.html", October, "2026-10-06T06:15:39.011Z");

    private static IReadOnlyList<BalanceUpdate> Resolve(IEnumerable<PostedUpdate> posted, List<string>? unmatched = null)
        => BalanceUpdates.Resolve(posted, Cards, title => unmatched?.Add(title));

    private static (int, CardVersionKind, BalanceChangeKind)[] Kinds(BalanceUpdate update)
        => update.Changes.Select(c => (c.CardId, c.Version, c.Kind)).ToArray();

    private static BalanceUpdate Update(DateOnly day, string summary = "Damage 1 → 2")
        => new(day, "https://supercell.com/x", [new BalanceChange(26000010, CardVersionKind.Normal, BalanceChangeKind.Buff, summary)]);

    private static CardStatsResponse StatsSince(string? since, string? previousSince, bool isLastPatch = false)
        => new(since, null, 1000, isLastPatch, [], previousSince);

    private const CardVersionKind Normal = CardVersionKind.Normal;
    private const CardVersionKind Evo = CardVersionKind.Evo;
    private const CardVersionKind Hero = CardVersionKind.Hero;
    private const BalanceChangeKind Nerf = BalanceChangeKind.Nerf;
    private const BalanceChangeKind Buff = BalanceChangeKind.Buff;
    private const BalanceChangeKind Rework = BalanceChangeKind.Rework;

    // What was typed in by hand from these notes, plus the Hero Electro Wizard buff and the Skeletons nerf it missed.
    [Fact]
    public void The_October_post_gives_the_cards_its_notes_changed_and_leaves_out_its_bug_fixes()
    {
        var updates = Resolve(ReadOctober());

        Assert.Equal([new DateOnly(2026, 10, 19), new DateOnly(2026, 10, 6)], updates.Select(u => u.LiveFrom));
        Assert.Equal(
            [
                (26000054, Normal, Nerf), (26000040, Normal, Nerf), (26000107, Normal, Nerf), (26000101, Normal, Nerf),
                (26000042, Hero, Buff), (26000063, Normal, Buff), (26000057, Normal, Buff), (28000023, Normal, Buff),
                (26000056, Evo, Rework), (26000056, Normal, Rework), (26000010, Normal, Rework),
            ],
            Kinds(updates[0]));
        Assert.Equal(
            [
                (26000023, Hero, Nerf), (27000000, Evo, Nerf), (28000015, Normal, Nerf), (27000007, Normal, Nerf),
                (26000107, Normal, Nerf), (26000050, Normal, Nerf), (26000010, Normal, Nerf),
                (28000004, Normal, Buff), (27000013, Normal, Buff), (26000029, Normal, Buff), (26000051, Normal, Buff),
                (26000058, Normal, Buff), (27000008, Normal, Buff), (26000077, Normal, Buff), (26000028, Normal, Buff),
                (26000074, Normal, Rework),
            ],
            Kinds(updates[1]));
        Assert.All(updates, u => Assert.Equal($"https://supercell.com{October}", u.NotesUrl));
    }

    [Theory]
    [InlineData(26000054, "Damage 212 → 202\nMass 3 → 6")]
    [InlineData(26000042, "Removed Attack Delay after Ability")]
    [InlineData(28000023, "2–4 Target Damage 296 → 307")]
    public void A_summary_is_the_stat_lines_without_their_share(int cardId, string summary)
        => Assert.Equal(summary, Resolve(ReadOctober())[0].Changes.First(c => c.CardId == cardId).Summary);

    [Fact]
    public void The_September_post_reads_a_singular_heading_and_names_with_asides_or_stray_spaces()
    {
        var updates = Resolve(Read("balance-post-september-2026.html", September, "2026-09-23T13:25:14.012Z"));

        Assert.Equal([new DateOnly(2026, 9, 16), new DateOnly(2026, 9, 8)], updates.Select(u => u.LiveFrom));
        Assert.Contains((26000031, Normal, Buff), Kinds(updates[0]));
        Assert.Contains((28000025, Normal, Buff), Kinds(updates[1]));
        Assert.Contains((26000039, Hero, Rework), Kinds(updates[1]));
    }

    [Fact]
    public void A_stat_that_follows_on_without_a_line_break_still_starts_its_own_line()
    {
        var page = Page(
            Heading("Balance Update – August 4th"),
            Heading("NERFS"),
            new
            {
                __typename = "FeatureBlock",
                title = "Elite Barbarians Evolution",
                featureText = Doc(Bold("Spear Damage: "), Plain("284 → 220 (-23%)"), Bold("Rage Duration: "), Plain("3.5sec → 2.5sec (-29%)")),
            });

        var change = Assert.Single(Assert.Single(PatchNotes.ParseUpdates(page, AugustPost)).Changes);

        Assert.Equal("Spear Damage 284 → 220\nRage Duration 3.5sec → 2.5sec", change.Summary);
    }

    [Fact]
    public void Cards_before_any_update_heading_or_kind_heading_are_left_out()
    {
        var page = Page(
            Feature("Knight"),
            Heading("Balance Update – August 4th"),
            Feature("Archers"),
            Heading("Ranked changes"),
            Feature("Giant"));

        Assert.Empty(Assert.Single(PatchNotes.ParseUpdates(page, AugustPost)).Changes);
    }

    [Fact]
    public void A_page_without_page_data_has_no_updates()
        => Assert.Empty(PatchNotes.ParseUpdates("<html><body><h3>Balance Update – October 6th</h3></body></html>", AugustPost));

    [Fact]
    public void A_title_naming_two_cards_changes_both()
    {
        var update = Assert.Single(Resolve([Posted(new PostedChange("Skeletons & Hero Ice Wizard", Buff, "Damage 1 → 2"))]));

        Assert.Equal([(26000010, Normal, Buff), (26000023, Hero, Buff)], Kinds(update));
    }

    [Fact]
    public void A_card_changed_twice_in_one_update_gets_one_change_saying_both()
    {
        var update = Assert.Single(Resolve([Posted(
            new PostedChange("Royal Ghost", Nerf, "Hitpoints 1210 → 1152"),
            new PostedChange("Royal Ghost", Buff, "Damage 261 → 263"))]));

        Assert.Equal(new BalanceChange(26000050, Normal, Nerf, "Hitpoints 1210 → 1152\nDamage 261 → 263"), Assert.Single(update.Changes));
    }

    [Fact]
    public void A_title_no_card_goes_by_is_reported_and_left_out()
    {
        var unmatched = new List<string>();

        var update = Assert.Single(Resolve([Posted(new PostedChange("Skeleton King & Skeletons", Buff, "x"), new PostedChange("Skeletons", Nerf, "y"))], unmatched));

        Assert.Equal(["Skeleton King & Skeletons"], unmatched);
        Assert.Equal([(26000010, Normal, Nerf)], Kinds(update));
    }

    [Fact]
    public void Gives_the_updates_since_the_patch_the_changes_compare_against_newest_first()
    {
        var updates = BalanceUpdates.During(
            [Update(new DateOnly(2026, 10, 6)), Update(new DateOnly(2026, 10, 19)), Update(new DateOnly(2026, 9, 16))],
            StatsSince("2026-11-02T09:32:46.298Z", "2026-10-05T09:00:00.000Z"));

        Assert.Equal([new DateOnly(2026, 10, 19), new DateOnly(2026, 10, 6)], updates.Select(u => u.LiveFrom));
    }

    [Fact]
    public void Without_a_comparison_gives_the_updates_of_the_patch_shown()
        => Assert.Single(BalanceUpdates.During(
            [Update(new DateOnly(2026, 10, 6)), Update(new DateOnly(2026, 9, 16))],
            StatsSince("2026-10-05T09:00:00.000Z", null, isLastPatch: true)));

    [Fact]
    public void Without_a_patch_gives_none()
        => Assert.Empty(BalanceUpdates.During([Update(new DateOnly(2026, 10, 6))], StatsSince(null, null)));

    private static readonly BlogPost AugustPost = new("August Balance Changes", "/en/games/clashroyale/blog/news/august", DateTimeOffset.Parse("2026-08-04T08:00:00Z"));

    private static PostedUpdate Posted(params PostedChange[] changes) => new(new DateOnly(2026, 10, 6), "https://supercell.com/x", changes);

    private static string Page(params object[] blocks)
        => $"""<html><body><script id="__NEXT_DATA__" type="application/json">{JsonSerializer.Serialize(new { props = new { pageProps = new { bodyCollection = blocks } } })}</script></body></html>""";

    private static object Heading(string text)
        => new { __typename = "TextBlock", title = "", text = new { json = new { nodeType = "document", content = new[] { new { nodeType = "heading-3", content = new[] { Plain(text) } } } } } };

    private static object Feature(string title) => new { __typename = "FeatureBlock", title, featureText = Doc(Bold("Damage: "), Plain("1 → 2")) };

    private static object Doc(params object[] texts) => new { json = new { nodeType = "document", content = new[] { new { nodeType = "paragraph", content = texts } } } };

    private static object Bold(string value) => new { nodeType = "text", value, marks = new[] { new { type = "bold" } } };

    private static object Plain(string value) => new { nodeType = "text", value, marks = Array.Empty<object>() };
}
