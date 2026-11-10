using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services.Reminders;

namespace RoyaleDeckLab.Api.Tests;

public sealed class ReminderMessageTests
{
    private static readonly DateTimeOffset DayEnds = new(2026, 11, 9, 9, 39, 0, TimeSpan.Zero);

    private static ClanWarMember Member(string name, int decksUsedToday)
        => new($"#{name.GetHashCode():X}", name, ClanRole.Member, null, decksUsedToday, ClanWar.DecksPerDay - decksUsedToday, 0, 0, [], []);

    private static ClanWar War(params ClanWarMember[] members)
        => new("#L9VRJ", "Example", null, WarPeriod.WarDay, 2, members, [], [], DayEnds, null);

    private static ReminderSettings Settings(ReminderMessageStyle style, ReminderPing ping = ReminderPing.Nobody)
        => new(2, style, ping, true);

    [Fact]
    public void Short_CountsWhoHasntPlayed_AndLinksThePlanner()
    {
        var war = War(Member("Anna", 0), Member("Bob", 0), Member("Cas", 2), Member("Dee", 4));

        var embed = ReminderMessage.Reminder(war, Settings(ReminderMessageStyle.Short), DayEnds).Embeds.Single();

        Assert.Equal("War day 2 of 4 · 10 decks still open", embed.Title);
        Assert.Contains($"<t:{DayEnds.ToUnixTimeSeconds()}:R>", embed.Description);
        Assert.Contains("2 haven't played yet, 1 is halfway.", embed.Description);
        Assert.Equal("https://royaledecklab.com/clan/L9VRJ?utm_source=discord", embed.Url);
        Assert.Empty(embed.Fields);
    }

    [Fact]
    public void Names_ListsWhoHasntStarted_ElseWhoIsHalfway()
    {
        var notStarted = War(Member("Anna", 0), Member("Cas", 2));
        var onlyStarted = War(Member("Cas", 2), Member("Dee", 4));

        var first = ReminderMessage.Reminder(notStarted, Settings(ReminderMessageStyle.Names), DayEnds).Embeds.Single();
        var second = ReminderMessage.Reminder(onlyStarted, Settings(ReminderMessageStyle.Names), DayEnds).Embeds.Single();

        Assert.Equal(("Not played yet", "Anna"), (first.Fields.Single().Name, first.Fields.Single().Value));
        Assert.Equal(("Still to finish", "Cas"), (second.Fields.Single().Name, second.Fields.Single().Value));
    }

    [Fact]
    public void Full_ListsEveryoneWithDecksLeft()
    {
        var war = War(Member("Bob", 0), Member("Anna", 0), Member("Cas", 3), Member("Dee", 1));

        var fields = ReminderMessage.Reminder(war, Settings(ReminderMessageStyle.Full), DayEnds).Embeds.Single().Fields;

        Assert.Equal("Not played yet (2)", fields[0].Name);
        Assert.Equal("Anna, Bob", fields[0].Value);
        Assert.Equal("Dee 3 · Cas 1", fields[1].Value);
    }

    [Fact]
    public void Full_StaysWithinDiscordsFieldLimit()
    {
        var members = Enumerable.Range(0, 100).Select(i => Member($"LongPlayerName{i:00}", 0)).ToArray();

        var field = ReminderMessage.Reminder(War(members), Settings(ReminderMessageStyle.Full), DayEnds).Embeds.Single().Fields[0];

        Assert.True(field.Value.Length <= 1024);
        Assert.EndsWith("more", field.Value);
    }

    [Fact]
    public void EscapesNames_SoTheyCantFormatOrPing()
    {
        var war = War(Member("*bold*", 0), Member("@everyone", 0), Member("[link](x)", 0));

        var value = ReminderMessage.Reminder(war, Settings(ReminderMessageStyle.Full), DayEnds).Embeds.Single().Fields[0].Value;

        Assert.Equal(@"\*bold\*, \@everyone, \[link\]\(x\)", value);
    }

    [Fact]
    public void EscapesEveryPunctuationMark_SoNoLinkOrHeadingSurvives()
    {
        Assert.Equal(@"evil\.example\/x \# \!", ReminderMessage.Escape("evil.example/x # !"));
    }

    [Theory]
    [InlineData("Bob\n# Headline", "Bob # Headline")]
    [InlineData("  Bob \t\r\n  Cas  ", "Bob Cas")]
    [InlineData("Bob‮evil‬", "Bobevil")]
    [InlineData("B​o‏b⁦﻿", "Bob")]
    [InlineData("\u0007Bob\u0000", "Bob")]
    [InlineData("👨‍👩‍👧", "👨‍👩‍👧")]
    public void Cleans_NamesOntoOneLineWithoutDirectionTricks(string name, string expected)
    {
        Assert.Equal(expected, ReminderMessage.Clean(name));
    }

    [Fact]
    public void PingsHere_OnlyWhenAskedTo()
    {
        var war = War(Member("Anna", 0));

        var quiet = ReminderMessage.Reminder(war, Settings(ReminderMessageStyle.Short), DayEnds);
        var loud = ReminderMessage.Reminder(war, Settings(ReminderMessageStyle.Short, ReminderPing.Here), DayEnds);

        Assert.Null(quiet.Content);
        Assert.Empty(quiet.AllowedMentions.Parse);
        Assert.Equal("@here", loud.Content);
        Assert.Equal(["everyone"], loud.AllowedMentions.Parse);
    }

    [Fact]
    public void CelebratesWhenEveryDeckIsPlayed()
    {
        var war = War(Member("Anna", 4), Member("Bob", 4));

        var embed = ReminderMessage.Reminder(war, Settings(ReminderMessageStyle.Full), DayEnds).Embeds.Single();

        Assert.Equal("War day 2 of 4 · every deck played 🎉", embed.Title);
        Assert.Equal("All 2 members played their 4 decks today.", embed.Description);
    }

    [Fact]
    public void Test_NeverPings()
    {
        var message = ReminderMessage.Test(War(Member("Anna", 0)), Settings(ReminderMessageStyle.Short, ReminderPing.Here));

        Assert.Null(message.Content);
        Assert.Empty(message.AllowedMentions.Parse);
    }
}
