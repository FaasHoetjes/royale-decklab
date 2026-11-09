using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services.Reminders;

/// <summary>
/// Encrypts webhook tokens with AES-GCM before they're stored, so a copy of the database alone can't post anywhere.
/// The webhook id is bound in as associated data: a token only decrypts under the webhook it belongs to.
/// </summary>
public sealed class WebhookTokenCipher
{
    private const int KeyBytes = 32;
    private const int NonceBytes = 12;
    private const int TagBytes = 16;

    private readonly byte[]? _key;

    public WebhookTokenCipher(IOptions<ReminderOptions> options, ILogger<WebhookTokenCipher> logger)
    {
        _key = ParseKey(options.Value.EncryptionKey);
        if (_key is null)
        {
            logger.LogWarning("Discord reminders are off: {EnvVar} is missing or isn't 32 bytes of base64", ReminderOptions.EncryptionKeyEnvVar);
        }
    }

    public bool IsAvailable => _key is not null;

    public byte[] Encrypt(string webhookId, string token)
    {
        using var aes = new AesGcm(RequireKey(), TagBytes);
        var plain = Encoding.UTF8.GetBytes(token);
        var sealedToken = new byte[NonceBytes + TagBytes + plain.Length];
        var nonce = sealedToken.AsSpan(0, NonceBytes);
        var tag = sealedToken.AsSpan(NonceBytes, TagBytes);
        var cipher = sealedToken.AsSpan(NonceBytes + TagBytes);
        RandomNumberGenerator.Fill(nonce);
        aes.Encrypt(nonce, plain, cipher, tag, Encoding.ASCII.GetBytes(webhookId));
        return sealedToken;
    }

    /// <exception cref="AuthenticationTagMismatchException">The token was sealed under another key or webhook.</exception>
    public string Decrypt(string webhookId, byte[] sealedToken)
    {
        if (sealedToken.Length <= NonceBytes + TagBytes)
        {
            throw new CryptographicException("The sealed webhook token is too short");
        }
        using var aes = new AesGcm(RequireKey(), TagBytes);
        var nonce = sealedToken.AsSpan(0, NonceBytes);
        var tag = sealedToken.AsSpan(NonceBytes, TagBytes);
        var cipher = sealedToken.AsSpan(NonceBytes + TagBytes);
        var plain = new byte[cipher.Length];
        aes.Decrypt(nonce, cipher, tag, plain, Encoding.ASCII.GetBytes(webhookId));
        return Encoding.UTF8.GetString(plain);
    }

    private byte[] RequireKey() => _key ?? throw new InvalidOperationException("Discord reminders are off: no encryption key");

    private static byte[]? ParseKey(string base64)
    {
        if (string.IsNullOrWhiteSpace(base64))
        {
            return null;
        }
        var key = new byte[KeyBytes];
        var isKey = Convert.TryFromBase64String(base64.Trim(), key, out var written) && written == KeyBytes;
        return isKey ? key : null;
    }
}
