export const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Clearsight IP - Bridge Your Skills Gap with AI-Powered Insights</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        primary: '#1a365d',
                        accent: '#14b8a6',
                        background: '#f8fafc',
                        text: '#1f2937'
                    }
                }
            }
        }
    </script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            scroll-behavior: smooth;
            color: #1f2937;
        }
        
        .dark-mode {
            background-color: #0f172a !important;
            color: #e2e8f0 !important;
        }
        
        .dark-mode * {
            color: #e2e8f0 !important;
        }
        
        .dark-mode .bg-light {
            background-color: #1e293b;
        }
        
        .dark-mode .text-dark {
            color: #e2e8f0;
        }
        
        .dark-mode .card {
            background-color: #1e293b;
            border: 1px solid #334155;
        }
        
        .feature-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        
        .hero-pattern {
            background-image: radial-gradient(#14b8a6 1px, transparent 1px);
            background-size: 20px 20px;
        }
        
        .code-block {
            background-color: #1e293b;
            border-radius: 0.5rem;
            padding: 1.5rem;
            font-family: monospace;
            overflow-x: auto;
        }
        
        .pricing-card {
            transition: all 0.3s ease;
        }
        
        .pricing-card:hover {
            transform: scale(1.03);
        }
        
        .demo-box {
            min-height: 300px;
        }
        
        .stats-number {
            font-size: 2.5rem;
            font-weight: 700;
        }
        
        .dark-mode .stats-number {
            color: #14b8a6;
        }
        
        .gradient-text {
            background: linear-gradient(90deg, #1a365d, #14b8a6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .dark-mode .gradient-text {
            background: linear-gradient(90deg, #60a5fa, #14b8a6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 60px;
            height: 30px;
        }
        
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 34px;
        }
        
        .slider:before {
            position: absolute;
            content: "";
            height: 22px;
            width: 22px;
            left: 4px;
            bottom: 4px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        
        input:checked + .slider {
            background-color: #14b8a6;
        }
        
        input:checked + .slider:before {
            transform: translateX(30px);
        }
        
        .nav-link {
            position: relative;
        }
        
        .nav-link::after {
            content: '';
            position: absolute;
            bottom: -5px;
            left: 0;
            width: 0;
            height: 2px;
            background-color: #14b8a6;
            transition: width 0.3s ease;
        }
        
        .nav-link:hover::after {
            width: 100%;
        }
        
        .animate-float {
            animation: float 6s ease-in-out infinite;
        }
        
        @keyframes float {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
            100% { transform: translateY(0px); }
        }
        
        .card {
            background-color: white;
            border: 1px solid #e5e7eb;
            box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
            transition: all 0.3s ease;
        }
        
        .bg-light {
            background-color: #f8fafc;
        }
    </style>
</head>
<body class="bg-background text-text dark:text-gray-200">
    <!-- Header -->
    <header class="sticky top-0 z-50 bg-white dark:bg-slate-900 shadow-md py-4 px-6">
        <div class="container mx-auto flex justify-between items-center">
            <div>
                <h1 class="text-2xl font-bold text-primary dark:text-accent">Clearsight IP</h1>
                <p class="text-sm text-gray-600 dark:text-gray-300">Bridge Your Skills Gap with AI-Powered Insights</p>
            </div>
            
            <nav class="hidden md:flex space-x-8">
                <a href="#features" class="nav-link text-gray-700 dark:text-gray-300 hover:text-primary dark:hover:text-accent">Features</a>
                <a href="#how-it-works" class="nav-link text-gray-700 dark:text-gray-300 hover:text-primary dark:hover:text-accent">How It Works</a>
                <a href="#api" class="nav-link text-gray-700 dark:text-gray-300 hover:text-primary dark:hover:text-accent">API Endpoints</a>
                <a href="#pricing" class="nav-link text-gray-700 dark:text-gray-300 hover:text-primary dark:hover:text-accent">Pricing</a>
                <a href="#documentation" class="nav-link text-gray-700 dark:text-gray-300 hover:text-primary dark:hover:text-accent">Documentation</a>
                <a href="#contact" class="nav-link text-gray-700 dark:text-gray-300 hover:text-primary dark:hover:text-accent">Contact</a>
            </nav>
            
            <div class="flex items-center space-x-4">
                <button id="theme-toggle" class="focus:outline-none">
                    <i class="fas fa-moon text-gray-700 dark:text-yellow-300 text-xl"></i>
                </button>
                <button class="bg-accent hover:bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-300">
                    Get API Access
                </button>
                <button class="md:hidden text-gray-700 dark:text-gray-300">
                    <i class="fas fa-bars text-2xl"></i>
                </button>
            </div>
        </div>
    </header>

    <!-- Hero Section -->
    <section class="py-16 md:py-24 hero-pattern">
        <div class="container mx-auto px-6 flex flex-col md:flex-row items-center">
            <div class="md:w-1/2 mb-12 md:mb-0">
                <h1 class="text-4xl md:text-5xl font-bold leading-tight mb-4">
                    Transform Career Development with <span class="gradient-text">Intelligent Skill Gap Analysis</span>
                </h1>
                <p class="text-xl text-gray-600 dark:text-gray-300 mb-8">
                    Analyze skills, identify gaps, and get personalized learning recommendations powered by AI
                </p>
                
                <div class="flex flex-wrap gap-4 mb-8">
                    <div class="flex items-center">
                        <i class="fas fa-file-alt text-accent mr-2"></i>
                        <span class="font-medium">Processing 50K+ resumes daily</span>
                    </div>
                    <div class="flex items-center">
                        <i class="fas fa-check-circle text-accent mr-2"></i>
                        <span class="font-medium">95% accuracy</span>
                    </div>
                    <div class="flex items-center">
                        <i class="fas fa-chart-line text-accent mr-2"></i>
                        <span class="font-medium">500+ skills tracked</span>
                    </div>
                </div>
                
                <div class="flex flex-wrap gap-4">
                    <button class="bg-primary hover:bg-blue-800 text-white font-semibold py-3 px-8 rounded-lg transition duration-300">
                        Start Free Trial
                    </button>
                    <button class="bg-transparent hover:bg-gray-100 dark:hover:bg-slate-800 border-2 border-primary text-primary dark:text-accent font-semibold py-3 px-8 rounded-lg transition duration-300">
                        View Live Demo
                    </button>
                </div>
            </div>
            
            <div class="md:w-1/2 flex justify-center">
                <div class="relative">
                    <div class="w-80 h-80 md:w-96 md:h-96 bg-gradient-to-br from-primary to-accent rounded-full opacity-10 absolute -top-10 -left-10 animate-float"></div>
                    <div class="w-64 h-64 md:w-80 md:h-80 bg-gradient-to-tr from-accent to-primary rounded-full opacity-10 absolute -bottom-10 -right-10 animate-float animation-delay-2000"></div>
                    <div class="relative bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold text-lg">Skill Gap Analysis Report</h3>
                            <span class="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded">Match: 72%</span>
                        </div>
                        
                        <div class="space-y-4">
                            <div>
                                <div class="flex justify-between mb-1">
                                    <span class="text-sm font-medium">JavaScript</span>
                                    <span class="text-sm font-medium">85%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2.5">
                                    <div class="bg-green-600 h-2.5 rounded-full" style="width: 85%"></div>
                                </div>
                            </div>
                            
                            <div>
                                <div class="flex justify-between mb-1">
                                    <span class="text-sm font-medium">React</span>
                                    <span class="text-sm font-medium">65%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2.5">
                                    <div class="bg-yellow-500 h-2.5 rounded-full" style="width: 65%"></div>
                                </div>
                            </div>
                            
                            <div>
                                <div class="flex justify-between mb-1">
                                    <span class="text-sm font-medium">Node.js</span>
                                    <span class="text-sm font-medium">45%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2.5">
                                    <div class="bg-red-500 h-2.5 rounded-full" style="width: 45%"></div>
                                </div>
                            </div>
                            
                            <div class="pt-4 border-t border-gray-200 dark:border-slate-700">
                                <h4 class="font-semibold mb-2">Recommended Learning Paths:</h4>
                                <ul class="list-disc pl-5 space-y-1 text-sm">
                                    <li>Advanced React Patterns Course</li>
                                    <li>Node.js Backend Development</li>
                                    <li>Full-Stack JavaScript Certification</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Core Features -->
    <section id="features" class="py-16 bg-light dark:bg-slate-800">
        <div class="container mx-auto px-6">
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold mb-4">Core Features</h2>
                <p class="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
                    Comprehensive skill gap analysis solutions for individuals and organizations
                </p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <!-- Feature 1 -->
                <div class="feature-card card p-6 rounded-xl transition-all duration-300">
                    <div class="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-4">
                        <i class="fas fa-user text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-2">Individual Skill Gap Analysis</h3>
                    <ul class="space-y-2 mb-4">
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Upload resume/CV in PDF, DOCX, or TXT format</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Compare skills against job requirements</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Get detailed match percentage and gap severity</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Receive personalized learning recommendations</span>
                        </li>
                    </ul>
                </div>
                
                <!-- Feature 2 -->
                <div class="feature-card card p-6 rounded-xl transition-all duration-300">
                    <div class="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-4">
                        <i class="fas fa-users text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-2">Team Skills Assessment</h3>
                    <ul class="space-y-2 mb-4">
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Analyze collective team capabilities</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Identify skill redundancies and gaps</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Optimize team composition for projects</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Track team skill evolution over time</span>
                        </li>
                    </ul>
                </div>
                
                <!-- Feature 3 -->
                <div class="feature-card card p-6 rounded-xl transition-all duration-300">
                    <div class="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-4">
                        <i class="fas fa-chart-line text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-2">Industry Trend Analysis</h3>
                    <ul class="space-y-2 mb-4">
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Real-time skill demand forecasting</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Regional skill trends and salary insights</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Emerging skills detection with AI</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Market predictions for 3-24 months</span>
                        </li>
                    </ul>
                </div>
                
                <!-- Feature 4 -->
                <div class="feature-card card p-6 rounded-xl transition-all duration-300">
                    <div class="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-4">
                        <i class="fas fa-file-alt text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-2">Resume/CV Parsing</h3>
                    <ul class="space-y-2 mb-4">
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Extract skills with context and confidence scores</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Identify experience levels (beginner to expert)</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Parse years of experience per skill</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Extract education, certifications, and work history</span>
                        </li>
                    </ul>
                </div>
                
                <!-- Feature 5 -->
                <div class="feature-card card p-6 rounded-xl transition-all duration-300">
                    <div class="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-4">
                        <i class="fas fa-brain text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-2">Smart Skill Matching</h3>
                    <ul class="space-y-2 mb-4">
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>AI-powered skill synonym recognition</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Context-aware skill extraction</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Multi-language skill detection</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Industry-specific skill taxonomies</span>
                        </li>
                    </ul>
                </div>
                
                <!-- Feature 6 -->
                <div class="feature-card card p-6 rounded-xl transition-all duration-300">
                    <div class="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-4">
                        <i class="fas fa-graduation-cap text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-2">Learning Path Generator</h3>
                    <ul class="space-y-2 mb-4">
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Personalized course recommendations</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Time-to-bridge estimates</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Budget-conscious learning options</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fas fa-check-circle text-accent mt-1 mr-2"></i>
                            <span>Progress tracking integration</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </section>

    <!-- How It Works -->
    <section id="how-it-works" class="py-16">
        <div class="container mx-auto px-6">
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
                <p class="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
                    Simple process to transform your career development journey
                </p>
            </div>
            
            <div class="flex flex-col md:flex-row justify-between items-center">
                <div class="mb-10 md:mb-0 text-center md:text-left md:w-2/5">
                    <div class="w-16 h-16 rounded-full bg-accent flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto md:mx-0">1</div>
                    <h3 class="text-2xl font-bold mb-3">Upload & Parse</h3>
                    <p class="text-gray-600 dark:text-gray-300">
                        Submit resumes or job descriptions via our secure API. Our system parses and extracts all relevant skills and experiences.
                    </p>
                </div>
                
                <div class="hidden md:block">
                    <div class="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-bold">2</div>
                </div>
                
                <div class="mb-10 md:mb-0 text-center md:text-left md:w-2/5">
                    <div class="w-16 h-16 rounded-full bg-accent flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto md:mx-0">2</div>
                    <h3 class="text-2xl font-bold mb-3">AI Analysis</h3>
                    <p class="text-gray-600 dark:text-gray-300">
                        Our advanced AI engine analyzes skills, compares them to job requirements, and identifies gaps with contextual understanding.
                    </p>
                </div>
                
                <div class="hidden md:block">
                    <div class="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-bold">3</div>
                </div>
                
                <div class="text-center md:text-left md:w-2/5">
                    <div class="w-16 h-16 rounded-full bg-accent flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto md:mx-0">3</div>
                    <h3 class="text-2xl font-bold mb-3">Get Insights</h3>
                    <p class="text-gray-600 dark:text-gray-300">
                        Receive detailed reports with skill gap analysis, severity ratings, and personalized learning recommendations.
                    </p>
                </div>
            </div>
        </div>
    </section>

    <!-- API Endpoints -->
    <section id="api" class="py-16 bg-light dark:bg-slate-800">
        <div class="container mx-auto px-6">
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold mb-4">API Endpoints</h2>
                <p class="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
                    Integrate skill gap analysis into your applications with our powerful REST API
                </p>
            </div>
            
            <div class="max-w-4xl mx-auto">
                <div class="code-block">
                    <pre class="text-gray-200"><code>// Individual skill analysis
POST /api/v1/analyze/gap
{
  "resume": "base64_encoded_file",
  "job_description": "Job requirements text"
}

// Team assessment
POST /api/v1/analyze/team
{
  "team_members": ["member1_id", "member2_id"]
}

// Industry trends
GET /api/v1/trends/industry/{industry_id}
{
  "region": "us-east",
  "timeframe": "12_months"
}

// Resume parsing
POST /api/v1/parse/resume
{
  "file": "base64_encoded_resume"
}

// Learning paths
GET /api/v1/skills/recommendations
{
  "skills": ["javascript", "react"],
  "budget": 500,
  "timeframe": "3_months"
}</code></pre>
                </div>
                
                <div class="mt-8 text-center">
                    <button class="inline-flex items-center text-accent font-semibold">
                        View Full API Documentation
                        <i class="fas fa-arrow-right ml-2"></i>
                    </button>
                </div>
            </div>
        </div>
    </section>

    <!-- Technology Stack -->
    <section class="py-16">
        <div class="container mx-auto px-6">
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold mb-4">Technology Stack</h2>
                <p class="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
                    Enterprise-grade infrastructure for reliable performance
                </p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div class="card p-6 rounded-xl text-center">
                    <div class="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                        <i class="fab fa-cloudflare text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-2">Cloudflare Workers</h3>
                    <p class="text-gray-600 dark:text-gray-300">Global edge deployment for ultra-low latency</p>
                </div>
                
                <div class="card p-6 rounded-xl text-center">
                    <div class="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                        <i class="fas fa-brain text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-2">AI/ML Engine</h3>
                    <p class="text-gray-600 dark:text-gray-300">Advanced skill extraction and matching algorithms</p>
                </div>
                
                <div class="card p-6 rounded-xl text-center">
                    <div class="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                        <i class="fas fa-bolt text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-2">Real-time Processing</h3>
                    <p class="text-gray-600 dark:text-gray-300">&lt;100ms latency for instant results</p>
                </div>
                
                <div class="card p-6 rounded-xl text-center">
                    <div class="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                        <i class="fas fa-shield-alt text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-2">99.9% Uptime SLA</h3>
                    <p class="text-gray-600 dark:text-gray-300">Reliable service backed by enterprise SLA</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Integration -->
    <section class="py-16 bg-light dark:bg-slate-800">
        <div class="container mx-auto px-6">
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold mb-4">Seamless Integration</h2>
                <p class="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
                    Connect with your existing tools and platforms
                </p>
            </div>
            
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8">
                <div class="flex flex-col items-center justify-center p-6 card rounded-xl">
                    <div class="w-16 h-16 mb-4 bg-white dark:bg-slate-700 rounded-lg flex items-center justify-center">
                        <span class="font-bold text-primary">ATS</span>
                    </div>
                    <p class="text-center">Applicant Tracking Systems</p>
                </div>
                
                <div class="flex flex-col items-center justify-center p-6 card rounded-xl">
                    <div class="w-16 h-16 mb-4 bg-white dark:bg-slate-700 rounded-lg flex items-center justify-center">
                        <span class="font-bold text-primary">HRIS</span>
                    </div>
                    <p class="text-center">HR Platforms</p>
                </div>
                
                <div class="flex flex-col items-center justify-center p-6 card rounded-xl">
                    <div class="w-16 h-16 mb-4 bg-white dark:bg-slate-700 rounded-lg flex items-center justify-center">
                        <span class="font-bold text-primary">LMS</span>
                    </div>
                    <p class="text-center">Learning Management Systems</p>
                </div>
                
                <div class="flex flex-col items-center justify-center p-6 card rounded-xl">
                    <div class="w-16 h-16 mb-4 bg-white dark:bg-slate-700 rounded-lg flex items-center justify-center">
                        <span class="font-bold text-primary">JOB</span>
                    </div>
                    <p class="text-center">Job Boards</p>
                </div>
                
                <div class="flex flex-col items-center justify-center p-6 card rounded-xl">
                    <div class="w-16 h-16 mb-4 bg-white dark:bg-slate-700 rounded-lg flex items-center justify-center">
                        <span class="font-bold text-primary">CDT</span>
                    </div>
                    <p class="text-center">Career Development Tools</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Pricing -->
    <section id="pricing" class="py-16">
        <div class="container mx-auto px-6">
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
                <p class="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
                    Choose the plan that fits your needs
                </p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                <!-- Developer Plan -->
                <div class="pricing-card card p-8 rounded-xl text-center">
                    <h3 class="text-2xl font-bold mb-2">Developer</h3>
                    <div class="mb-6">
                        <span class="text-4xl font-bold">$0</span>
                        <span class="text-gray-600 dark:text-gray-300">/month</span>
                    </div>
                    <ul class="space-y-3 mb-8">
                        <li class="flex items-center justify-center">
                            <i class="fas fa-check-circle text-accent mr-2"></i>
                            <span>1,000 API calls/month</span>
                        </li>
                        <li class="flex items-center justify-center">
                            <i class="fas fa-check-circle text-accent mr-2"></i>
                            <span>Basic skill analysis</span>
                        </li>
                        <li class="flex items-center justify-center">
                            <i class="fas fa-check-circle text-accent mr-2"></i>
                            <span>Email support</span>
                        </li>
                        <li class="flex items-center justify-center text-gray-400">
                            <i class="fas fa-times-circle mr-2"></i>
                            <span>Team analytics</span>
                        </li>
                        <li class="flex items-center justify-center text-gray-400">
                            <i class="fas fa-times-circle mr-2"></i>
                            <span>Trend analysis</span>
                        </li>
                    </ul>
                    <button class="w-full bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-primary dark:text-accent font-semibold py-3 px-4 rounded-lg transition duration-300">
                        Get Started
                    </button>
                </div>
                
                <!-- Professional Plan -->
                <div class="pricing-card card p-8 rounded-xl text-center border-2 border-accent relative">
                    <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-accent text-white text-sm font-bold px-4 py-1 rounded-full">
                        MOST POPULAR
                    </div>
                    <h3 class="text-2xl font-bold mb-2">Professional</h3>
                    <div class="mb-6">
                        <span class="text-4xl font-bold">$99</span>
                        <span class="text-gray-600 dark:text-gray-300">/month</span>
                    </div>
                    <ul class="space-y-3 mb-8">
                        <li class="flex items-center justify-center">
                            <i class="fas fa-check-circle text-accent mr-2"></i>
                            <span>50,000 API calls/month</span>
                        </li>
                        <li class="flex items-center justify-center">
                            <i class="fas fa-check-circle text-accent mr-2"></i>
                            <span>Full skill analysis features</span>
                        </li>
                        <li class="flex items-center justify-center">
                            <i class="fas fa-check-circle text-accent mr-2"></i>
                            <span>Team analytics (up to 25 members)</span>
                        </li>
                        <li class="flex items-center justify-center">
                            <i class="fas fa-check-circle text-accent mr-2"></i>
                            <span>Industry trend reports</span>
                        </li>
                        <li class="flex items-center justify-center">
                            <i class="fas fa-check-circle text-accent mr-2"></i>
                            <span>Priority email support</span>
                        </li>
                    </ul>
                    <button class="w-full bg-accent hover:bg-teal-600 text-white font-semibold py-3 px-4 rounded-lg transition duration-300">
                        Start Free Trial
                    </button>
                </div>
                
                <!-- Enterprise Plan -->
                <div class="pricing-card card p-8 rounded-xl text-center">
                    <h3 class="text-2xl font-bold mb-2">Enterprise</h3>
                    <div class="mb-6">
                        <span class="text-4xl font-bold">Custom</span>
                    </div>
                    <ul class="space-y-3 mb-8">
                        <li class="flex items-center justify-center">
                            <i class="fas fa-check-circle text-accent mr-2"></i>
                            <span>Unlimited API calls</span>
                        </li>
                        <li class="flex items-center justify-center">
                            <i class="fas fa-check-circle text-accent mr-2"></i>
                            <span>All features included</span>
                        </li>
                        <li class="flex items-center justify-center">
                            <i class="fas fa-check-circle text-accent mr-2"></i>
                            <span>Dedicated account manager</span>
                        </li>
                        <li class="flex items-center justify-center">
                            <i class="fas fa-check-circle text-accent mr-2"></i>
                            <span>Custom integrations</span>
                        </li>
                        <li class="flex items-center justify-center">
                            <i class="fas fa-check-circle text-accent mr-2"></i>
                            <span>SLA guarantee</span>
                        </li>
                    </ul>
                    <button class="w-full bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-primary dark:text-accent font-semibold py-3 px-4 rounded-lg transition duration-300">
                        Contact Sales
                    </button>
                </div>
            </div>
        </div>
    </section>

    <!-- Security & Compliance -->
    <section class="py-16 bg-light dark:bg-slate-800">
        <div class="container mx-auto px-6">
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold mb-4">Security & Compliance</h2>
                <p class="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
                    Enterprise-grade security to protect your data
                </p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 max-w-5xl mx-auto">
                <div class="flex flex-col items-center text-center">
                    <div class="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-4">
                        <i class="fas fa-key text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="font-bold mb-2">JWT/API Key Auth</h3>
                    <p class="text-gray-600 dark:text-gray-300 text-sm">Secure authentication methods</p>
                </div>
                
                <div class="flex flex-col items-center text-center">
                    <div class="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-4">
                        <i class="fas fa-lock text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="font-bold mb-2">End-to-End Encryption</h3>
                    <p class="text-gray-600 dark:text-gray-300 text-sm">Data protection at rest and in transit</p>
                </div>
                
                <div class="flex flex-col items-center text-center">
                    <div class="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-4">
                        <i class="fas fa-gavel text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="font-bold mb-2">GDPR/CCPA Compliant</h3>
                    <p class="text-gray-600 dark:text-gray-300 text-sm">Privacy regulations adherence</p>
                </div>
                
                <div class="flex flex-col items-center text-center">
                    <div class="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-4">
                        <i class="fas fa-trash-alt text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="font-bold mb-2">No Permanent Storage</h3>
                    <p class="text-gray-600 dark:text-gray-300 text-sm">Personal data is not retained</p>
                </div>
                
                <div class="flex flex-col items-center text-center">
                    <div class="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-4">
                        <i class="fas fa-certificate text-primary dark:text-accent text-2xl"></i>
                    </div>
                    <h3 class="font-bold mb-2">ISO 27001 Certified</h3>
                    <p class="text-gray-600 dark:text-gray-300 text-sm">Information security management</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Live Demo -->
    <section class="py-16">
        <div class="container mx-auto px-6">
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold mb-4">Live Demo</h2>
                <p class="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
                    Experience skill gap analysis in action
                </p>
            </div>
            
            <div class="max-w-4xl mx-auto">
                <div class="card demo-box rounded-xl p-6">
                    <div class="mb-6">
                        <label class="block text-gray-700 dark:text-gray-300 font-medium mb-2" for="resume-input">
                            Paste Sample Resume Text
                        </label>
                        <textarea id="resume-input" class="w-full h-40 p-4 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100" placeholder="Paste your resume text here...">Software Engineer with 5 years of experience in web development. Proficient in JavaScript, React, Node.js, and MongoDB. Experienced with AWS cloud services and Docker containerization. Bachelor's degree in Computer Science from MIT. Seeking opportunities to work on challenging projects that leverage cutting-edge technologies.</textarea>
                    </div>
                    
                    <div class="flex justify-center mb-6">
                        <button id="analyze-btn" class="bg-primary hover:bg-blue-800 text-white font-semibold py-3 px-8 rounded-lg transition duration-300">
                            Analyze Skills
                        </button>
                    </div>
                    
                    <div id="demo-results" class="hidden">
                        <h3 class="text-xl font-bold mb-4">Analysis Results</h3>
                        
                        <div class="mb-6">
                            <h4 class="font-semibold mb-2">Extracted Skills:</h4>
                            <div class="flex flex-wrap gap-2">
                                <span class="bg-blue-100 dark:bg-blue-900/50 text-primary dark:text-accent px-3 py-1 rounded-full text-sm">JavaScript</span>
                                <span class="bg-blue-100 dark:bg-blue-900/50 text-primary dark:text-accent px-3 py-1 rounded-full text-sm">React</span>
                                <span class="bg-blue-100 dark:bg-blue-900/50 text-primary dark:text-accent px-3 py-1 rounded-full text-sm">Node.js</span>
                                <span class="bg-blue-100 dark:bg-blue-900/50 text-primary dark:text-accent px-3 py-1 rounded-full text-sm">MongoDB</span>
                                <span class="bg-blue-100 dark:bg-blue-900/50 text-primary dark:text-accent px-3 py-1 rounded-full text-sm">AWS</span>
                                <span class="bg-blue-100 dark:bg-blue-900/50 text-primary dark:text-accent px-3 py-1 rounded-full text-sm">Docker</span>
                            </div>
                        </div>
                        
                        <div class="mb-6">
                            <h4 class="font-semibold mb-2">Skill Match Analysis:</h4>
                            <div class="space-y-3">
                                <div>
                                    <div class="flex justify-between mb-1">
                                        <span>JavaScript</span>
                                        <span>85% Match</span>
                                    </div>
                                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                                        <div class="bg-green-600 h-2.5 rounded-full" style="width: 85%"></div>
                                    </div>
                                </div>
                                
                                <div>
                                    <div class="flex justify-between mb-1">
                                        <span>React</span>
                                        <span>75% Match</span>
                                    </div>
                                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                                        <div class="bg-green-500 h-2.5 rounded-full" style="width: 75%"></div>
                                    </div>
                                </div>
                                
                                <div>
                                    <div class="flex justify-between mb-1">
                                        <span>Node.js</span>
                                        <span>60% Match</span>
                                    </div>
                                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                                        <div class="bg-yellow-500 h-2.5 rounded-full" style="width: 60%"></div>
                                    </div>
                                </div>
                                
                                <div>
                                    <div class="flex justify-between mb-1">
                                        <span>AWS</span>
                                        <span>45% Match</span>
                                    </div>
                                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                                        <div class="bg-red-500 h-2.5 rounded-full" style="width: 45%"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div>
                            <h4 class="font-semibold mb-2">Recommended Learning Paths:</h4>
                            <ul class="list-disc pl-5 space-y-2">
                                <li><strong>Advanced Node.js:</strong> Master server-side JavaScript with Express and database integration</li>
                                <li><strong>AWS Certification:</strong> Complete AWS Solutions Architect certification path</li>
                                <li><strong>Full-Stack Development:</strong> Combine frontend and backend skills for complete project ownership</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer id="contact" class="bg-primary text-white pt-16 pb-8">
        <div class="container mx-auto px-6">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
                <div class="lg:col-span-2">
                    <h2 class="text-2xl font-bold mb-4">Clearsight IP</h2>
                    <p class="mb-6 max-w-md">
                        Bridge Your Skills Gap with AI-Powered Insights. Transform career development with intelligent skill gap analysis.
                    </p>
                    <div class="flex space-x-4">
                        <a href="#" class="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                            <i class="fab fa-twitter"></i>
                        </a>
                        <a href="#" class="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                            <i class="fab fa-linkedin-in"></i>
                        </a>
                        <a href="#" class="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                            <i class="fab fa-github"></i>
                        </a>
                    </div>
                </div>
                
                <div>
                    <h3 class="text-lg font-semibold mb-4">Product</h3>
                    <ul class="space-y-2">
                        <li><a href="#" class="hover:text-accent transition">Features</a></li>
                        <li><a href="#" class="hover:text-accent transition">Solutions</a></li>
                        <li><a href="#" class="hover:text-accent transition">Pricing</a></li>
                        <li><a href="#" class="hover:text-accent transition">Demo</a></li>
                    </ul>
                </div>
                
                <div>
                    <h3 class="text-lg font-semibold mb-4">Resources</h3>
                    <ul class="space-y-2">
                        <li><a href="#" class="hover:text-accent transition">Documentation</a></li>
                        <li><a href="#" class="hover:text-accent transition">API Reference</a></li>
                        <li><a href="#" class="hover:text-accent transition">Guides</a></li>
                        <li><a href="#" class="hover:text-accent transition">Blog</a></li>
                    </ul>
                </div>
                
                <div>
                    <h3 class="text-lg font-semibold mb-4">Company</h3>
                    <ul class="space-y-2">
                        <li><a href="#" class="hover:text-accent transition">About Us</a></li>
                        <li><a href="#" class="hover:text-accent transition">Careers</a></li>
                        <li><a href="#" class="hover:text-accent transition">Contact</a></li>
                        <li><a href="#" class="hover:text-accent transition">Status</a></li>
                    </ul>
                </div>
            </div>
            
            <div class="pt-8 border-t border-blue-800 text-center text-sm">
                <div class="flex flex-col md:flex-row justify-center space-y-2 md:space-y-0 md:space-x-6 mb-4">
                    <a href="#" class="hover:text-accent transition">Terms of Service</a>
                    <a href="#" class="hover:text-accent transition">Privacy Policy</a>
                    <a href="#" class="hover:text-accent transition">Cookie Policy</a>
                    <a href="#" class="hover:text-accent transition">GDPR Compliance</a>
                </div>
                <p>&copy; 2023 Clearsight IP. All rights reserved.</p>
            </div>
        </div>
    </footer>

    <script>
        // Theme toggle functionality
        const themeToggle = document.getElementById('theme-toggle');
        const body = document.body;
        const themeIcon = themeToggle.querySelector('i');
        
        // Check for saved theme preference or respect OS setting
        const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
        const currentTheme = localStorage.getItem('theme');
        
        if (currentTheme === 'dark' || (!currentTheme && prefersDarkScheme.matches)) {
            body.classList.add('dark-mode');
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        } else {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }
        
        themeToggle.addEventListener('click', function() {
            body.classList.toggle('dark-mode');
            
            if (body.classList.contains('dark-mode')) {
                themeIcon.classList.remove('fa-moon');
                themeIcon.classList.add('fa-sun');
                localStorage.setItem('theme', 'dark');
            } else {
                themeIcon.classList.remove('fa-sun');
                themeIcon.classList.add('fa-moon');
                localStorage.setItem('theme', 'light');
            }
        });
        
        // Demo functionality
        const analyzeBtn = document.getElementById('analyze-btn');
        const demoResults = document.getElementById('demo-results');
        const resumeInput = document.getElementById('resume-input');
        
        analyzeBtn.addEventListener('click', function() {
            if (resumeInput.value.trim() !== '') {
                demoResults.classList.remove('hidden');
                demoResults.scrollIntoView({ behavior: 'smooth' });
            }
        });
        
        // Smooth scrolling for navigation links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                
                const targetId = this.getAttribute('href');
                const targetElement = document.querySelector(targetId);
                
                if (targetElement) {
                    window.scrollTo({
                        top: targetElement.offsetTop - 80,
                        behavior: 'smooth'
                    });
                }
            });
        });
    </script>
</body>
</html>`;
