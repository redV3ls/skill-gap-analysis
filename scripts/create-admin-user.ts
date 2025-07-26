#!/usr/bin/env node

/**
 * Secure Admin User Creation Script
 * 
 * This script creates an admin user with proper security measures:
 * - Prompts for secure password
 * - Uses bcrypt hashing
 * - Validates password strength
 * - Generates secure UUID
 * 
 * Usage: npm run create-admin
 */

import { createInterface } from 'readline';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

interface AdminUserData {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  organization: string;
  role: 'admin';
  createdAt: string;
}

// Password strength validation
function validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Email validation
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Prompt user for input
function promptUser(question: string, hidden: boolean = false): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    if (hidden) {
      // Hide password input
      const stdin = process.stdin;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');
      
      let password = '';
      console.log(question);
      
      stdin.on('data', (char) => {
        char = char.toString();
        
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004': // Ctrl+D
            stdin.setRawMode(false);
            stdin.pause();
            console.log('');
            rl.close();
            resolve(password);
            break;
          case '\u0003': // Ctrl+C
            process.exit();
            break;
          case '\u007f': // Backspace
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
            break;
          default:
            password += char;
            process.stdout.write('*');
            break;
        }
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

async function createAdminUser(): Promise<AdminUserData> {
  console.log('🔐 Secure Admin User Creation');
  console.log('================================\n');

  // Get admin details
  const email = await promptUser('Enter admin email: ');
  if (!validateEmail(email)) {
    throw new Error('Invalid email format');
  }

  const name = await promptUser('Enter admin full name: ');
  if (!name || name.length < 2) {
    throw new Error('Name must be at least 2 characters long');
  }

  const organization = await promptUser('Enter organization name: ');
  if (!organization || organization.length < 2) {
    throw new Error('Organization name must be at least 2 characters long');
  }

  // Get and validate password
  let password: string;
  let passwordValid = false;
  
  while (!passwordValid) {
    password = await promptUser('Enter secure password: ', true);
    const validation = validatePasswordStrength(password);
    
    if (validation.isValid) {
      passwordValid = true;
    } else {
      console.log('\n❌ Password does not meet requirements:');
      validation.errors.forEach(error => console.log(`  - ${error}`));
      console.log('');
    }
  }

  // Confirm password
  const confirmPassword = await promptUser('Confirm password: ', true);
  if (password !== confirmPassword) {
    throw new Error('Passwords do not match');
  }

  // Hash password with bcrypt
  console.log('\n🔄 Hashing password...');
  const passwordHash = await bcrypt.hash(password!, 12);

  const adminUser: AdminUserData = {
    id: randomUUID(),
    email,
    passwordHash,
    name,
    organization,
    role: 'admin',
    createdAt: new Date().toISOString()
  };

  return adminUser;
}

async function generateSQLInsert(adminUser: AdminUserData): Promise<string> {
  return `
-- Secure Admin User Creation
-- Generated: ${new Date().toISOString()}
-- Email: ${adminUser.email}

INSERT INTO users (
  id,
  email,
  password_hash,
  name,
  organization,
  role,
  created_at,
  updated_at
) VALUES (
  '${adminUser.id}',
  '${adminUser.email}',
  '${adminUser.passwordHash}',
  '${adminUser.name}',
  '${adminUser.organization}',
  '${adminUser.role}',
  '${adminUser.createdAt}',
  '${adminUser.createdAt}'
);
`;
}

async function main() {
  try {
    const adminUser = await createAdminUser();
    const sqlInsert = await generateSQLInsert(adminUser);
    
    console.log('\n✅ Admin user created successfully!');
    console.log('\n📋 SQL Insert Statement:');
    console.log('========================');
    console.log(sqlInsert);
    
    console.log('\n🚀 Next Steps:');
    console.log('1. Copy the SQL statement above');
    console.log('2. Run it against your database using wrangler d1 execute');
    console.log('3. Example: wrangler d1 execute skill-gap-db --command="[SQL_STATEMENT]"');
    console.log('\n⚠️  Security Note: Store this SQL securely and delete after use');
    
  } catch (error) {
    console.error('\n❌ Error creating admin user:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

export { createAdminUser, validatePasswordStrength, validateEmail };