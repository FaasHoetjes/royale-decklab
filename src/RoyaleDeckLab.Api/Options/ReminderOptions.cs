namespace RoyaleDeckLab.Api.Options;

public sealed class ReminderOptions
{
    public const string EncryptionKeyEnvVar = "WEBHOOK_ENCRYPTION_KEY";

    /// <summary>32 random bytes in base64 that encrypt the stored webhook tokens. Without it, Discord reminders are off.</summary>
    public string EncryptionKey { get; set; } = "";
}
