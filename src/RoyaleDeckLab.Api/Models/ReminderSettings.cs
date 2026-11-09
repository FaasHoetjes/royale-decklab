namespace RoyaleDeckLab.Api.Models;

public enum ReminderMessageStyle
{
    Short,
    Names,
    Full,
}

public enum ReminderPing
{
    Nobody,
    Here,
}

/// <summary>How a clan's Discord reminder posts: how long before the war day ends, how much it says, and whom it pings.</summary>
public sealed record ReminderSettings(
    int HoursBeforeReset,
    ReminderMessageStyle Style,
    ReminderPing Ping,
    bool PostWhenAllDone)
{
    public static readonly IReadOnlyList<int> HourChoices = [1, 2, 3, 6];

    public bool IsValid => HourChoices.Contains(HoursBeforeReset) && Enum.IsDefined(Style) && Enum.IsDefined(Ping);
}
