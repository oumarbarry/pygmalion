import { staffUser } from '@oumarbarry/pygmalion-core/schema'
import { eq } from 'drizzle-orm'
import { createError, defineEventHandler } from 'h3'
import { usePygmalion } from '../../../utils/pygmalion'

// GET /api/admin/users/me — the signed-in staff profile + its resolved role.
// No permission gate: any authenticated staff reads its own profile (the admin
// middleware already refused anonymous callers). Never returns a credential.
export default defineEventHandler(async (event) => {
  const staff = event.context.staff
  if (!staff) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const { db } = usePygmalion()
  const [row] = await db
    .select({ id: staffUser.id, email: staffUser.email, name: staffUser.name, image: staffUser.image, createdAt: staffUser.createdAt })
    .from(staffUser)
    .where(eq(staffUser.id, staff.user.id))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  return { user: { ...row, role: staff.role } }
})
