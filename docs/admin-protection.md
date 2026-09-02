# ZARK ADMIN PROTECTION

The protected owner is configured server-side with `DISCORD_OWNER_ID`. The current
Zark owner ID is `492368135144603658`; Discord's `Administrator` permission alone
never grants this level.

## Railway variables

Set these in the service that runs both the API and bot:

```text
DISCORD_OWNER_ID=492368135144603658
DISCORD_GUILD_ID=your-server-id
INTERNAL_API_KEY=a-long-random-secret
```

For complete protection, grant the bot `View Audit Log`, `Manage Roles`, `Manage
Messages`, and make its highest role higher than every administrative role that it
may need to remove. The bot logs a startup warning when it is below an Administrator
role. It cannot manage the Discord server owner, managed/integration roles, or roles
above its own role.

## Behaviour

- Events are recorded from Discord Audit Logs, including actions from Discord UI and other bots.
- Each audit-log entry is deduplicated by guild and audit-log ID.
- Missing or ambiguous audit correlation is stored as a warning only; it never auto-suspends a person.
- Limits use the last 60 minutes, not the clock hour. Defaults: 2 bans and 2 timeouts.
- On a confirmed threshold breach, dangerous manageable roles are snapshotted, removed, and the account is marked `SUSPENDED`.
- Only the owner can open `/security.html`, change limits, or request a role restoration. Restoration adds only original roles that still exist and are manageable.
