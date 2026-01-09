import { supabase } from '../config/supabase.js'
import { hashPassword, comparePassword } from '../utils/auth.js'

export const createUser = async (userData) => {
  try {
    const { username, email, password, full_name, google_id, apple_id, profile_photo_url } = userData

    let password_hash = null
    if (password) {
      password_hash = await hashPassword(password)
    }

    const { data, error } = await supabase
      .from('users')
      .insert({
        username,
        email,
        full_name,
        password_hash,
        google_id,
        apple_id,
        profile_photo_url,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('Database error creating user:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error creating user:', error)
    throw error
  }
}

export const findUserByEmail = async (email) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Database error finding user by email:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error finding user by email:', error)
    throw error
  }
}

export const findUserByUsername = async (username) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Database error finding user by username:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error finding user by username:', error)
    throw error
  }
}

export const findUserById = async (id) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Database error finding user by ID:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error finding user by ID:', error)
    throw error
  }
}

export const findUserByGoogleId = async (google_id) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('google_id', google_id)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Database error finding user by Google ID:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error finding user by Google ID:', error)
    throw error
  }
}

export const findUserByAppleId = async (apple_id) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('apple_id', apple_id)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Database error finding user by Apple ID:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error finding user by Apple ID:', error)
    throw error
  }
}

export const updateUser = async (id, updates) => {
  try {
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Database error updating user:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error updating user:', error)
    throw error
  }
}

export const updateLastLogin = async (id) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ 
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Database error updating last login:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error updating last login:', error)
    throw error
  }
}

export const verifyPassword = async (plainPassword, hashedPassword) => {
  return await comparePassword(plainPassword, hashedPassword)
}

export const checkUsernameAvailability = async (username) => {
  try {
    const user = await findUserByUsername(username)
    return !user
  } catch (error) {
    console.error('Error checking username availability:', error)
    throw error
  }
}

export const checkEmailAvailability = async (email) => {
  try {
    const user = await findUserByEmail(email)
    return !user
  } catch (error) {
    console.error('Error checking email availability:', error)
    throw error
  }
}

/**
 * Store Apple user data (persists even after account deletion)
 * This allows us to remember the user's info for future sign-ins since
 * Apple only provides this data on the first authorization
 */
export const storeAppleUserData = async (apple_id, appleData) => {
  if (!apple_id) return null

  const { email, fullName } = appleData

  // Only store if we have some data to store
  if (!email && !fullName?.givenName && !fullName?.familyName) return null

  const full_name = fullName && (fullName.givenName || fullName.familyName)
    ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim()
    : null

  try {
    // Upsert: insert if not exists, update if exists
    const { data, error } = await supabase
      .from('apple_user_data')
      .upsert({
        apple_id,
        email: email || null,
        full_name,
        given_name: fullName?.givenName || null,
        family_name: fullName?.familyName || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'apple_id'
      })
      .select()
      .single()

    if (error) {
      console.error('Error storing Apple user data:', error)
      return null
    }

    console.log('✅ Stored Apple user data:', apple_id, '-> name:', full_name, 'email:', email)
    return data
  } catch (error) {
    console.error('Error storing Apple user data:', error)
    return null
  }
}

/**
 * Retrieve stored Apple user data from mapping table
 */
export const getAppleUserData = async (apple_id) => {
  if (!apple_id) return null

  try {
    const { data, error } = await supabase
      .from('apple_user_data')
      .select('*')
      .eq('apple_id', apple_id)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error retrieving Apple user data:', error)
      return null
    }

    if (data) {
      console.log('✅ Found stored Apple user data:', apple_id, '-> name:', data.full_name, 'email:', data.email)
    }

    return data || null
  } catch (error) {
    console.error('Error retrieving Apple user data:', error)
    return null
  }
}