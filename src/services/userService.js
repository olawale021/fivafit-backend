import { supabase } from '../config/supabase.js'
import { hashPassword, comparePassword } from '../utils/auth.js'

export const createUser = async (userData) => {
  try {
    const { username, email, password, full_name, google_id, profile_photo_url } = userData
    
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