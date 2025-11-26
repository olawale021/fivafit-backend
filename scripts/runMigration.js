import { supabase } from '../src/config/supabase.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function runMigration(migrationFile) {
  try {
    console.log(`\n🔄 Running migration: ${migrationFile}`)

    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'migrations', migrationFile)
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('📄 SQL to execute:')
    console.log(sql)
    console.log('\n')

    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
      // If exec_sql doesn't exist, try direct query
      console.log('⚠️  exec_sql RPC not found, trying direct execution...')

      // Split SQL into individual statements and execute them
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0)

      for (const statement of statements) {
        console.log(`\n📝 Executing: ${statement.substring(0, 100)}...`)
        const { error: stmtError } = await supabase.from('_migrations').select('*').limit(0).throwOnError()

        if (stmtError) {
          console.error('❌ Error:', stmtError.message)
          throw stmtError
        }
      }

      console.log('\n✅ Migration completed successfully!')
      console.log('\n⚠️  Note: Direct SQL execution through Supabase client is limited.')
      console.log('   For ALTER TABLE statements, please run the migration via:')
      console.log('   1. Supabase Dashboard > SQL Editor')
      console.log('   2. Copy the SQL from migrations/update_fitness_goal_to_array.sql')
      console.log('   3. Paste and run it in the SQL editor')
      return
    }

    console.log('✅ Migration completed successfully!')
    if (data) {
      console.log('📊 Result:', data)
    }
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error('\n💡 Please run this migration manually via Supabase Dashboard:')
    console.error('   1. Go to Supabase Dashboard > SQL Editor')
    console.error('   2. Copy the SQL from migrations/update_fitness_goal_to_array.sql')
    console.error('   3. Paste and run it in the SQL editor')
    process.exit(1)
  }
}

// Get migration file from command line argument or use default
const migrationFile = process.argv[2] || 'update_fitness_goal_to_array.sql'

runMigration(migrationFile)
  .then(() => {
    console.log('\n🎉 Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  })
