namespace RoyaleDeckLab.Api.Security;

public static class RateLimitPolicies
{
    public const string Player = "player";
    public const string Clan = "clan";

    /// <summary>Searching clans by name, a few requests per name typed.</summary>
    public const string ClanSearch = "clan-search";

    /// <summary>Turning a clan's Discord reminders on or off, which asks Discord about the webhook.</summary>
    public const string Reminders = "reminders";

    /// <summary>A test post to a Discord channel, kept rare so the site can't be used to flood one.</summary>
    public const string ReminderTest = "reminder-test";
    public const string Admin = "admin";

    /// <summary>Viewing the stats, which refreshes itself and refetches on every filter click.</summary>
    public const string AdminStats = "admin-stats";
    public const string Stats = "stats";
}
