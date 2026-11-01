using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class CardPeriodsTests
{
    private const string BeforePatch = "20261001T120000.000Z";
    private const string AfterPatch = "20261010T120000.000Z";
    private static readonly long Patch = BattleRepository.ParseBattleTime("20261005T000000.000Z");

    private static CardPeriod[] Tally(IEnumerable<BattleRecord> battles, params (long, long)[] periods)
    {
        var tallier = new CardTallier(periods);
        foreach (var b in battles)
        {
            tallier.Add(b);
        }
        return tallier.Periods();
    }

    private static CardTally Card(CardPeriod period, int id) => Assert.Single(period.Cards, c => c.CardId == id);

    private static CardPeriod Period(int battles, int games, double wins, long start = 0, long end = long.MaxValue)
        => new(start, end, battles, [new CardTally(1, games, wins, 0, 0)]);

    [Fact]
    public void Counts_games_and_wins_per_card_with_a_draw_as_half_a_win()
    {
        var deck = Build.Eight(1);
        var period = Assert.Single(Tally(
            [
                Build.Battle("#P1", deck, BattleResult.Win),
                Build.Battle("#P2", deck, BattleResult.Draw),
                Build.Battle("#P3", Build.Eight(5), BattleResult.Loss),
            ],
            (0, long.MaxValue)));

        Assert.Equal(3, period.Battles);
        Assert.Equal(new CardTally(1, 2, 1.5, 0, 0), Card(period, 1));
        Assert.Equal(new CardTally(5, 3, 1.5, 0, 0), Card(period, 5));
        Assert.Equal(new CardTally(12, 1, 0, 0, 0), Card(period, 12));
    }

    [Fact]
    public void Counts_how_often_each_card_is_played_as_Evo_and_as_Hero()
    {
        var deck = Build.Eight(1);
        CardVersion[] evo = [new(1, CardVersionKind.Evo), new(2, CardVersionKind.Hero)];
        CardVersion[] hero = [new(1, CardVersionKind.Hero)];
        var period = Assert.Single(Tally(
            [
                Build.Battle("#P1", deck, BattleResult.Win, versions: evo),
                Build.Battle("#P2", deck, BattleResult.Win, versions: evo),
                Build.Battle("#P3", deck, BattleResult.Win, versions: hero),
                Build.Battle("#P4", deck, BattleResult.Win),
            ],
            (0, long.MaxValue)));

        Assert.Equal(new CardTally(1, 4, 4, EvoGames: 2, HeroGames: 1), Card(period, 1));
        Assert.Equal(new CardTally(2, 4, 4, EvoGames: 0, HeroGames: 2), Card(period, 2));
    }

    [Fact]
    public void Splits_battles_at_the_patch_and_skips_those_outside_every_period()
    {
        var deck = Build.Eight(1);
        var periods = Tally(
            [
                Build.Battle("#P1", deck, BattleResult.Win, BeforePatch),
                Build.Battle("#P2", deck, BattleResult.Loss, AfterPatch),
                Build.Battle("#P3", deck, BattleResult.Loss, AfterPatch),
                Build.Battle("#P4", deck, BattleResult.Win, "20260901T120000.000Z"),
            ],
            (BattleRepository.ParseBattleTime("20260920T000000.000Z"), Patch), (Patch, long.MaxValue));

        Assert.Equal(1, periods[0].Battles);
        Assert.Equal(new CardTally(1, 1, 1, 0, 0), Card(periods[0], 1));
        Assert.Equal(2, periods[1].Battles);
        Assert.Equal(new CardTally(1, 2, 0, 0, 0), Card(periods[1], 1));
    }

    [Fact]
    public void Play_rate_is_the_share_of_battles_with_the_card()
    {
        var stats = CardPeriods.Compare(Period(battles: 40_000, games: 10_000, wins: 5_000), null);

        var card = Assert.Single(stats.Cards);
        Assert.Equal(0.25, card.PlayRate, 10);
        Assert.Equal(0.5, card.WinRate, 10);
        Assert.Null(card.WinRateChange);
    }

    [Fact]
    public void A_win_rate_change_beyond_two_standard_errors_is_clear()
    {
        // 52% on 10,000 games against 50% on 10,000: the difference's standard error is 0.7 points, so 2 points is clear.
        var stats = CardPeriods.Compare(
            Period(battles: 50_000, games: 10_000, wins: 5_200),
            Period(battles: 50_000, games: 10_000, wins: 5_000, end: Patch));

        var card = Assert.Single(stats.Cards);
        Assert.Equal(0.02, card.WinRateChange!.Value, 10);
        Assert.True(card.ChangeIsClear);
        Assert.Equal(0.5, card.PreviousWinRate!.Value, 10);
        Assert.Equal(0.2, card.PreviousPlayRate!.Value, 10);
        Assert.Equal(10_000, card.PreviousGames);
    }

    [Fact]
    public void A_win_rate_change_within_the_noise_is_not_clear()
    {
        // The same 2 points on 400 games a side has a standard error of 3.5 points.
        var stats = CardPeriods.Compare(
            Period(battles: 50_000, games: 400, wins: 208),
            Period(battles: 50_000, games: 400, wins: 200, end: Patch));

        var card = Assert.Single(stats.Cards);
        Assert.Equal(0.02, card.WinRateChange!.Value, 10);
        Assert.False(card.ChangeIsClear);
    }

    [Fact]
    public void No_change_is_given_when_either_patch_has_too_few_games()
    {
        var stats = CardPeriods.Compare(
            Period(battles: 50_000, games: 5_000, wins: 3_000),
            Period(battles: 50_000, games: CardPeriods.MinGamesForChange - 1, wins: 10, end: Patch));

        var card = Assert.Single(stats.Cards);
        Assert.Null(card.WinRateChange);
        Assert.False(card.ChangeIsClear);
        Assert.NotNull(card.PreviousWinRate);
    }

    [Fact]
    public void Shows_the_last_patch_until_the_new_one_has_enough_battles()
    {
        var previous = Period(battles: 200_000, games: 20_000, wins: 11_000, start: Patch - 1000, end: Patch);
        var stats = CardPeriods.Compare(Period(battles: CardPeriods.MinCurrentBattles - 1, games: 900, wins: 400, start: Patch), previous);

        Assert.True(stats.IsLastPatch);
        Assert.Equal(200_000, stats.Battles);
        Assert.Equal(MetaCache.IsoMs(Patch), stats.Until);
        var card = Assert.Single(stats.Cards);
        Assert.Equal(0.55, card.WinRate, 10);
        Assert.Null(card.WinRateChange);
    }

    [Fact]
    public void Shows_the_new_patch_once_it_has_enough_battles()
    {
        var previous = Period(battles: 200_000, games: 20_000, wins: 11_000, end: Patch);
        var stats = CardPeriods.Compare(Period(battles: CardPeriods.MinCurrentBattles, games: 900, wins: 400, start: Patch), previous);

        Assert.False(stats.IsLastPatch);
        Assert.Equal(MetaCache.IsoMs(Patch), stats.Since);
        Assert.Null(stats.Until);
        Assert.Equal(0.4 / 0.9, Assert.Single(stats.Cards).WinRate, 10);
    }
}
