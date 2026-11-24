import postgres from 'postgres'

export function connectAuthStore(env = process.env) {
  const sql = postgres({
    host: env.PGHOST || '127.0.0.1',
    port: Number(env.PGPORT || 5432),
    database: env.PGDATABASE || 'bricklab',
    username: env.PGUSER || 'bricklab_app',
    password: env.PGPASSWORD,
    max: 10, connect_timeout: 5, idle_timeout: 30,
    ssl: env.PGSSL === 'require' ? 'verify-full' : false,
  })
  return {
    async ready() { await sql`select 1 from bricklab.sessions limit 1` },
    async register({ email, displayName, passwordHash, tokenHash, expiresAt }) {
      return sql.begin(async tx => {
        const [user] = await tx`insert into bricklab.users (email, display_name, password_hash)
          values (${email}, ${displayName}, ${passwordHash})
          returning id, email, display_name as "displayName"`
        await tx`insert into bricklab.sessions (token_hash, user_id, expires_at)
          values (${tokenHash}, ${user.id}, ${expiresAt})`
        return user
      })
    },
    async findUser(email) {
      const [user] = await sql`select id, email, display_name as "displayName", password_hash as "passwordHash"
        from bricklab.users where lower(email) = ${email}`
      return user
    },
    async createSession(userId, tokenHash, expiresAt, previousHash) {
      await sql.begin(async tx => {
        if (previousHash) await tx`delete from bricklab.sessions where token_hash = ${previousHash}`
        await tx`insert into bricklab.sessions (token_hash, user_id, expires_at) values (${tokenHash}, ${userId}, ${expiresAt})`
      })
    },
    async getSession(tokenHash) {
      const [user] = await sql`select u.id, u.email, u.display_name as "displayName"
        from bricklab.sessions s join bricklab.users u on u.id = s.user_id
        where s.token_hash = ${tokenHash} and s.expires_at > now()`
      return user
    },
    async deleteSession(tokenHash) {
      await sql`delete from bricklab.sessions where token_hash = ${tokenHash}`
    },
    async cleanup() { await sql`delete from bricklab.sessions where expires_at <= now()` },
    async close() { await sql.end({ timeout: 5 }) },
  }
}
