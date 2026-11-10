namespace RoyaleDeckLab.Api.Models;

public static class WarDay
{
    /// <summary>A clan's war day resets at the same UTC time every day; this is the next time it is that time.</summary>
    public static DateTimeOffset NextReset(TimeSpan resetTimeOfDay, DateTimeOffset now)
    {
        var today = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);
        var reset = today + resetTimeOfDay;
        return reset > now ? reset : reset.AddDays(1);
    }
}
