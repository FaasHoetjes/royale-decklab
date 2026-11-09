using System.Globalization;
using System.Text;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services.Reminders;

/// <summary>
/// The war reminder as a Discord embed, worded like the planner's clan chat reminder. Member names are escaped, so
/// a name can't format the message, and the message only pings when the clan asked for @here.
/// </summary>
public static class ReminderMessage
{
    public const string Username = "Royale DeckLab";

    private const int OpenColor = 0xE8B24A;
    private const int DoneColor = 0x22C55E;
    private const int NamesShown = 5;
    private const int MaxFieldLength = 1024;
    private const string Footer = "royaledecklab.com";

    public static DiscordMessage Reminder(ClanWar war, ReminderSettings settings, DateTimeOffset dayEndsAt)
    {
        var embed = war.DecksLeftToday == 0
            ? AllDoneEmbed(war)
            : OpenEmbed(war, settings.Style, dayEndsAt);
        return Message(embed, settings.Ping);
    }

    /// <summary>Shows the clan that the channel works, without pinging anyone.</summary>
    public static DiscordMessage Test(ClanWar war, ReminderSettings settings)
    {
        var hours = settings.HoursBeforeReset == 1 ? "1 hour" : $"{settings.HoursBeforeReset} hours";
        var embed = new DiscordEmbed(
            $"War reminders for {Clean(war.Name)} will post here",
            PlannerLink(war),
            $"Every war day, {hours} before the day ends: who still has decks to play.",
            OpenColor,
            [],
            new DiscordEmbedFooter(Footer));
        return Message(embed, ReminderPing.Nobody);
    }

    /// <summary>
    /// A player-chosen name made safe for markdown: every ASCII punctuation mark is escaped, so nothing in it can
    /// format, link or mention.
    /// </summary>
    public static string Escape(string text)
    {
        var clean = Clean(text);
        var escaped = new StringBuilder(clean.Length * 2);
        foreach (var c in clean)
        {
            if (IsAsciiPunctuation(c))
            {
                escaped.Append('\\');
            }
            escaped.Append(c);
        }
        return escaped.ToString();
    }

    /// <summary>
    /// Drops control and direction characters and folds whitespace into single spaces, so a name stays on one line
    /// and can't reorder the text around it. Zero-width joiners stay, as emoji need them.
    /// </summary>
    public static string Clean(string text)
    {
        var clean = new StringBuilder(text.Length);
        var lastWasSpace = true;
        foreach (var rune in text.EnumerateRunes())
        {
            if (Rune.IsWhiteSpace(rune))
            {
                if (!lastWasSpace)
                {
                    clean.Append(' ');
                }
                lastWasSpace = true;
                continue;
            }
            if (IsInvisibleControl(rune))
            {
                continue;
            }
            clean.Append(rune.ToString());
            lastWasSpace = false;
        }
        return clean.ToString().TrimEnd();
    }

    private static DiscordMessage Message(DiscordEmbed embed, ReminderPing ping)
    {
        var pingsHere = ping == ReminderPing.Here;
        var mentions = new DiscordAllowedMentions(pingsHere ? ["everyone"] : []);
        return new DiscordMessage(pingsHere ? "@here" : null, Username, [embed], mentions);
    }

    private static DiscordEmbed OpenEmbed(ClanWar war, ReminderMessageStyle style, DateTimeOffset dayEndsAt)
    {
        var left = war.DecksLeftToday;
        var notStarted = war.Members
            .Where(m => m.DecksLeftToday > 0 && m.DecksUsedToday == 0)
            .OrderBy(m => m.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var started = war.Members
            .Where(m => m.DecksLeftToday > 0 && m.DecksUsedToday > 0)
            .OrderByDescending(m => m.DecksLeftToday)
            .ThenBy(m => m.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var description = new StringBuilder($"Day ends <t:{dayEndsAt.ToUnixTimeSeconds()}:R>.");
        var fields = new List<DiscordEmbedField>();
        switch (style)
        {
            case ReminderMessageStyle.Short:
                description.Append(' ').Append(Counts(notStarted.Count, started.Count));
                break;
            case ReminderMessageStyle.Names:
                fields.Add(NamesField(notStarted, started));
                break;
            case ReminderMessageStyle.Full:
                fields.AddRange(FullFields(notStarted, started));
                break;
        }
        description.Append("\n\n[Everyone's status and best decks](").Append(PlannerLink(war)).Append(')');

        return new DiscordEmbed(
            $"{DayLabel(war)} · {left} {(left == 1 ? "deck" : "decks")} still open",
            PlannerLink(war),
            description.ToString(),
            OpenColor,
            fields,
            new DiscordEmbedFooter(Footer));
    }

    private static DiscordEmbed AllDoneEmbed(ClanWar war)
        => new(
            $"{DayLabel(war)} · every deck played 🎉",
            PlannerLink(war),
            $"All {war.Members.Count} members played their {ClanWar.DecksPerDay} decks today.",
            DoneColor,
            [],
            new DiscordEmbedFooter(Footer));

    private static string Counts(int notStarted, int started)
    {
        var parts = new List<string>();
        if (notStarted > 0)
        {
            parts.Add($"{notStarted} {(notStarted == 1 ? "hasn't" : "haven't")} played yet");
        }
        if (started > 0)
        {
            parts.Add($"{started} {(started == 1 ? "is" : "are")} halfway");
        }
        return string.Join(", ", parts) + ".";
    }

    private static DiscordEmbedField NamesField(List<ClanWarMember> notStarted, List<ClanWarMember> started)
    {
        if (notStarted.Count > 0)
        {
            return new DiscordEmbedField("Not played yet", ShortList(notStarted.Select(m => Escape(m.Name)).ToList()));
        }
        return new DiscordEmbedField("Still to finish", ShortList(started.Select(m => Escape(m.Name)).ToList()));
    }

    private static IEnumerable<DiscordEmbedField> FullFields(List<ClanWarMember> notStarted, List<ClanWarMember> started)
    {
        if (notStarted.Count > 0)
        {
            yield return new DiscordEmbedField(
                $"Not played yet ({notStarted.Count})",
                JoinWithinLimit(notStarted.Select(m => Escape(m.Name)).ToList(), ", "));
        }
        if (started.Count > 0)
        {
            yield return new DiscordEmbedField(
                "Decks left to finish",
                JoinWithinLimit(started.Select(m => $"{Escape(m.Name)} {m.DecksLeftToday}").ToList(), " · "));
        }
    }

    private static string ShortList(List<string> names)
    {
        if (names.Count <= NamesShown)
        {
            return string.Join(", ", names);
        }
        return $"{string.Join(", ", names.Take(NamesShown))} +{names.Count - NamesShown}";
    }

    /// <summary>Discord rejects a field over 1024 characters; a clan of long names ends in "+N more" instead.</summary>
    private static string JoinWithinLimit(List<string> items, string separator)
    {
        var joined = string.Join(separator, items);
        if (joined.Length <= MaxFieldLength)
        {
            return joined;
        }

        var text = new StringBuilder();
        for (var shown = 0; shown < items.Count; shown++)
        {
            var more = $"{separator}+{items.Count - shown} more";
            var next = shown == 0 ? items[0] : separator + items[shown];
            if (text.Length + next.Length + more.Length > MaxFieldLength)
            {
                return text.Append(more).ToString();
            }
            text.Append(next);
        }
        return text.ToString();
    }

    private static string DayLabel(ClanWar war)
        => war.Period == WarPeriod.Colosseum
            ? $"Colosseum day {war.Day} of {ClanWar.WarDays}"
            : $"War day {war.Day} of {ClanWar.WarDays}";

    private static string PlannerLink(ClanWar war)
        => $"{SpaPages.Origin}/clan/{war.Tag.TrimStart('#')}?utm_source=discord";

    private static bool IsAsciiPunctuation(char c) => c is >= '!' and <= '~' && !char.IsAsciiLetterOrDigit(c);

    private static bool IsInvisibleControl(Rune rune)
    {
        if (Rune.GetUnicodeCategory(rune) == UnicodeCategory.Control)
        {
            return true;
        }
        return rune.Value is 0x061C or 0x200B or 0x200E or 0x200F or 0xFEFF
            or (>= 0x202A and <= 0x202E)
            or (>= 0x2066 and <= 0x2069);
    }
}
