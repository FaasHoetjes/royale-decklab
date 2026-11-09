namespace RoyaleDeckLab.Api.Dtos;

/// <summary>The body of a Discord webhook post. Sent with snake_case names, leaving out nulls.</summary>
public sealed record DiscordMessage(
    string? Content,
    string Username,
    IReadOnlyList<DiscordEmbed> Embeds,
    DiscordAllowedMentions AllowedMentions);

public sealed record DiscordEmbed(
    string Title,
    string? Url,
    string Description,
    int Color,
    IReadOnlyList<DiscordEmbedField> Fields,
    DiscordEmbedFooter Footer);

public sealed record DiscordEmbedField(string Name, string Value);

public sealed record DiscordEmbedFooter(string Text);

/// <summary>Which mentions in the message may ping: "everyone" covers both @everyone and @here.</summary>
public sealed record DiscordAllowedMentions(IReadOnlyList<string> Parse);

/// <summary>What Discord says about a webhook when it's asked with the webhook's own token.</summary>
public sealed record DiscordWebhookInfo(string? Name, string? GuildId);
