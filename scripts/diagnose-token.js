#!/usr/bin/env node
/**
 * Diagnose a failing JWT from production.
 *
 * Usage:
 *   node scripts/diagnose-token.js <token>
 *
 * Prints the decoded header + payload (without verifying the signature),
 * then tries to verify against JWT_SECRET from .env and reports which
 * failure mode we're in: expired, bad signature, or actually valid.
 */

import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const token = process.argv[2]
if (!token) {
  console.error('Usage: node scripts/diagnose-token.js <token>')
  process.exit(1)
}

const secret = process.env.JWT_SECRET
if (!secret) {
  console.error('JWT_SECRET not found in .env')
  process.exit(1)
}

console.log('Secret length:', secret.length, 'chars')
console.log('')

// 1. Decode without verifying so we can see the payload even if expired/bad-sig.
const decoded = jwt.decode(token, { complete: true })
if (!decoded) {
  console.log('❌ Token is not a valid JWT structure (not three base64 segments).')
  console.log('   This means the mobile client is sending something that is not a JWT at all.')
  process.exit(0)
}

console.log('Header:', JSON.stringify(decoded.header, null, 2))
console.log('Payload:', JSON.stringify(decoded.payload, null, 2))
console.log('')

// Signature source: Supabase JWTs use HS256 with `iss: https://<project>.supabase.co/auth/v1`
// Our custom JWTs have no `iss` claim and payload is `{ userId, email, iat, exp }`.
if (decoded.payload.iss && decoded.payload.iss.includes('supabase')) {
  console.log('⚠️  This is a SUPABASE token (iss contains "supabase"), not our custom JWT.')
  console.log('   The mobile client is sending the wrong token type — it picked this up from /api/auth/refresh.')
}
if (!decoded.payload.userId) {
  console.log('⚠️  Payload has no `userId` field — middleware would reject this even if signature verified.')
}

// 2. Check exp
const now = Math.floor(Date.now() / 1000)
if (decoded.payload.exp) {
  const expiresAt = new Date(decoded.payload.exp * 1000)
  const issuedAt = decoded.payload.iat ? new Date(decoded.payload.iat * 1000) : null
  const secondsRemaining = decoded.payload.exp - now
  console.log('Issued at :', issuedAt ? issuedAt.toISOString() : '(no iat)')
  console.log('Expires at:', expiresAt.toISOString())
  console.log('Now       :', new Date(now * 1000).toISOString())
  if (secondsRemaining < 0) {
    const daysAgo = Math.abs(secondsRemaining) / 86400
    console.log(`❌ EXPIRED ${daysAgo.toFixed(2)} days ago`)
  } else {
    const daysLeft = secondsRemaining / 86400
    console.log(`✅ Not yet expired — ${daysLeft.toFixed(2)} days remaining`)
  }
}
console.log('')

// 3. Try to verify with our secret
try {
  jwt.verify(token, secret)
  console.log('✅ Signature verifies against JWT_SECRET — token is genuine and not expired.')
  console.log('   If middleware is still rejecting this, the problem is downstream (e.g. findUserById).')
} catch (err) {
  if (err.name === 'TokenExpiredError') {
    console.log('❌ Signature OK, but TOKEN IS EXPIRED. This is diagnosis #1: natural expiry.')
    console.log('   Fix: ship a working /api/auth/refresh and mobile refresh flow (or force re-login).')
  } else if (err.name === 'JsonWebTokenError') {
    console.log('❌ SIGNATURE MISMATCH:', err.message)
    console.log('   This token was NOT signed with the current JWT_SECRET.')
    console.log('   Possible causes:')
    console.log('   - The secret was rotated at some point after this token was issued.')
    console.log('   - The mobile client is sending a Supabase token (check iss above).')
    console.log('   - There are multiple backend instances with different JWT_SECRET values.')
  } else {
    console.log('❌ Verify failed:', err.name, err.message)
  }
}
