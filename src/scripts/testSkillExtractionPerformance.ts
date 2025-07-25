#!/usr/bin/env node

/**
 * Performance test script for skill extraction service
 * This script demonstrates the performance improvements made to the skill extraction service
 */

import { SkillExtractionService } from '../services/skillExtraction';
import { DocumentParser } from '../utils/documentParser';

// Sample resume text for testing
const sampleResumeText = `
John Doe
Senior Software Engineer
Email: john.doe@example.com
Phone: (555) 123-4567

SUMMARY
Experienced software engineer with 8+ years of experience in full-stack development.
Expert in JavaScript, TypeScript, and modern web technologies.

TECHNICAL SKILLS
• Programming Languages: JavaScript (8 years), TypeScript (5 years), Python (4 years), Java (3 years)
• Frontend: React (6 years), Angular (3 years), Vue.js (2 years), HTML5, CSS3
• Backend: Node.js (7 years), Express (5 years), Django (2 years), Spring Boot (2 years)
• Databases: MongoDB (5 years), PostgreSQL (4 years), Redis (3 years), MySQL (3 years)
• Cloud: AWS (4 years), Docker (4 years), Kubernetes (2 years), Azure (1 year)
• Tools: Git, Jenkins, JIRA, VS Code, Webpack, Babel

EXPERIENCE
Senior Software Engineer | Tech Corp | 2020 - Present
• Led development of microservices architecture using Node.js and Docker
• Implemented CI/CD pipelines with Jenkins and AWS
• Expert in React development with advanced TypeScript
• Mentored junior developers and conducted code reviews

Software Developer | StartupXYZ | 2018 - 2020
• Developed responsive web applications using React and TypeScript
• Built RESTful APIs with Express and MongoDB
• Intermediate Python programming for data processing
• Collaborated with cross-functional teams in Agile environment

Junior Developer | WebCorp | 2016 - 2018
• Basic JavaScript and HTML/CSS development
• Beginner level Python scripting
• Familiar with MySQL database operations
• Entry level experience with Git version control

EDUCATION
Bachelor of Science in Computer Science | University of Technology | 2016
GPA: 3.8/4.0

CERTIFICATIONS
• AWS Certified Solutions Architect (Advanced level)
• MongoDB Certified Developer (Expert level)
• Scrum Master Certification
`;

async function runPerformanceTests() {
  console.log('🚀 Starting Skill Extraction Performance Tests\n');

  const skillExtractor = new SkillExtractionService();
  const documentParser = new DocumentParser();

  // Test 1: Basic skill extraction performance
  console.log('📊 Test 1: Basic Skill Extraction Performance');
  const startTime1 = performance.now();
  const skills = await skillExtractor.extractSkills(sampleResumeText);
  const endTime1 = performance.now();
  
  console.log(`✅ Extracted ${skills.length} skills in ${(endTime1 - startTime1).toFixed(2)}ms`);
  console.log(`📈 Skills found: ${skills.slice(0, 10).map(s => s.skill).join(', ')}${skills.length > 10 ? '...' : ''}\n`);

  // Test 2: Document parsing performance
  console.log('📊 Test 2: Document Parsing Performance');
  const textBuffer = new TextEncoder().encode(sampleResumeText);
  const startTime2 = performance.now();
  const parseResult = await skillExtractor.parseDocument(textBuffer.buffer, 'txt');
  const endTime2 = performance.now();
  
  console.log(`✅ Parsed document in ${(endTime2 - startTime2).toFixed(2)}ms`);
  console.log(`📄 Word count: ${parseResult.metadata.wordCount}`);
  console.log(`🔍 Skills extracted: ${parseResult.skills.length}\n`);

  // Test 3: Large text performance
  console.log('📊 Test 3: Large Text Performance');
  const largeText = sampleResumeText.repeat(50); // ~50KB of text
  const startTime3 = performance.now();
  const largeSkills = await documentParser.extractSkillsFromText(largeText);
  const endTime3 = performance.now();
  
  console.log(`✅ Processed ${(largeText.length / 1024).toFixed(1)}KB text in ${(endTime3 - startTime3).toFixed(2)}ms`);
  console.log(`🔍 Skills extracted: ${largeSkills.length}\n`);

  // Test 4: Experience level and years extraction accuracy
  console.log('📊 Test 4: Experience Level & Years Extraction');
  const skillsWithExperience = skills.filter(s => s.experienceLevel || s.yearsExperience);
  console.log(`✅ Found ${skillsWithExperience.length} skills with experience data:`);
  
  skillsWithExperience.slice(0, 8).forEach(skill => {
    const experience = skill.experienceLevel ? `Level: ${skill.experienceLevel}` : '';
    const years = skill.yearsExperience ? `Years: ${skill.yearsExperience}` : '';
    const info = [experience, years].filter(Boolean).join(', ');
    console.log(`   • ${skill.skill} (${info})`);
  });

  // Test 5: Error handling performance
  console.log('\n📊 Test 5: Error Handling Performance');
  const startTime5 = performance.now();
  try {
    await skillExtractor.parseDocument(new ArrayBuffer(100), 'unsupported');
  } catch (error) {
    const endTime5 = performance.now();
    console.log(`✅ Error handled gracefully in ${(endTime5 - startTime5).toFixed(2)}ms`);
    console.log(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Test 6: Memory efficiency test
  console.log('\n📊 Test 6: Memory Efficiency Test');
  const memBefore = process.memoryUsage();
  
  // Process multiple documents
  const promises = Array(10).fill(0).map(async (_, i) => {
    const text = sampleResumeText.replace('John Doe', `User ${i}`);
    return await skillExtractor.extractSkills(text);
  });
  
  const startTime6 = performance.now();
  const results = await Promise.all(promises);
  const endTime6 = performance.now();
  
  const memAfter = process.memoryUsage();
  const memDiff = memAfter.heapUsed - memBefore.heapUsed;
  
  console.log(`✅ Processed 10 documents in parallel in ${(endTime6 - startTime6).toFixed(2)}ms`);
  console.log(`💾 Memory usage: ${(memDiff / 1024 / 1024).toFixed(2)}MB`);
  console.log(`📊 Total skills found: ${results.reduce((sum, skills) => sum + skills.length, 0)}`);

  console.log('\n🎉 Performance tests completed successfully!');
  console.log('\n📋 Summary of Improvements:');
  console.log('   • ✅ Fixed processing time calculation using performance.now()');
  console.log('   • ✅ Optimized regex compilation and reuse');
  console.log('   • ✅ Improved error handling for unsupported file types');
  console.log('   • ✅ Added text size limits for performance');
  console.log('   • ✅ Enhanced experience level and years extraction');
  console.log('   • ✅ Better deduplication and sorting algorithms');
  console.log('   • ✅ Added comprehensive logging and monitoring');
}

// Run the tests if this script is executed directly
if (require.main === module) {
  runPerformanceTests().catch(console.error);
}

export { runPerformanceTests };