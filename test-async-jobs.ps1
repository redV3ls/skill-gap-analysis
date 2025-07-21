# Test script for async job processing

$baseUrl = "http://127.0.0.1:8787/api/v1"

# First, we need to register and login to get a token
Write-Host "1. Registering test user..." -ForegroundColor Yellow
$registerBody = @{
    email = "async-test-$(Get-Random)@example.com"
    password = "Password123!"
    name = "Async Test User"
} | ConvertTo-Json

try {
    $registerResponse = Invoke-WebRequest -Uri "$baseUrl/auth/register" -Method POST -Body $registerBody -ContentType "application/json"
    $authData = $registerResponse.Content | ConvertFrom-Json
    $token = $authData.token
    Write-Host "✓ Registration successful" -ForegroundColor Green
} catch {
    Write-Host "Registration failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host "`n2. Submitting async gap analysis job..." -ForegroundColor Yellow
$gapAnalysisBody = @{
    user_skills = @(
        @{
            skill = "JavaScript"
            level = "intermediate"
            years_experience = 3
        },
        @{
            skill = "React"
            level = "beginner"
            years_experience = 1
        }
    )
    target_job = @{
        title = "Senior Full Stack Developer"
        description = "We are looking for a Senior Full Stack Developer with expertise in React, Node.js, and cloud technologies."
        company = "Tech Corp"
        location = "Remote"
    }
    analysis_options = @{
        include_recommendations = $true
        include_learning_paths = $true
    }
} | ConvertTo-Json -Depth 10

try {
    $jobResponse = Invoke-WebRequest -Uri "$baseUrl/jobs/gap-analysis" -Method POST -Body $gapAnalysisBody -Headers $headers
    $jobData = $jobResponse.Content | ConvertFrom-Json
    $jobId = $jobData.jobId
    Write-Host "✓ Job submitted successfully. Job ID: $jobId" -ForegroundColor Green
    Write-Host "  Estimated time: $($jobData.estimatedTime)" -ForegroundColor Cyan
} catch {
    Write-Host "Failed to submit job: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n3. Checking job status..." -ForegroundColor Yellow
$maxAttempts = 10
$attempt = 0

while ($attempt -lt $maxAttempts) {
    Start-Sleep -Seconds 2
    
    try {
        $statusResponse = Invoke-WebRequest -Uri "$baseUrl/jobs/$jobId" -Method GET -Headers $headers
        $status = $statusResponse.Content | ConvertFrom-Json
        
        Write-Host "  Status: $($status.status)" -NoNewline
        if ($status.progress) {
            Write-Host " (Progress: $($status.progress)%)" -ForegroundColor Cyan
        } else {
            Write-Host ""
        }
        
        if ($status.status -eq "completed" -or $status.status -eq "failed") {
            break
        }
    } catch {
        Write-Host "  Error checking status: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    $attempt++
}

if ($status.status -eq "completed") {
    Write-Host "`n4. Retrieving job result..." -ForegroundColor Yellow
    try {
        $resultResponse = Invoke-WebRequest -Uri "$baseUrl/jobs/$jobId/result" -Method GET -Headers $headers
        $result = $resultResponse.Content | ConvertFrom-Json
        Write-Host "✓ Job completed successfully!" -ForegroundColor Green
        Write-Host "Result:" -ForegroundColor Yellow
        Write-Host ($result | ConvertTo-Json -Depth 10) -ForegroundColor Cyan
    } catch {
        Write-Host "Failed to get result: $($_.Exception.Message)" -ForegroundColor Red
    }
} elseif ($status.status -eq "failed") {
    Write-Host "`n✗ Job failed with error: $($status.error)" -ForegroundColor Red
} else {
    Write-Host "`n⚠ Job did not complete within timeout" -ForegroundColor Yellow
}

Write-Host "`n5. Listing user's jobs..." -ForegroundColor Yellow
try {
    $jobsResponse = Invoke-WebRequest -Uri "$baseUrl/jobs" -Method GET -Headers $headers
    $jobs = $jobsResponse.Content | ConvertFrom-Json
    Write-Host "Total jobs: $($jobs.count)" -ForegroundColor Cyan
    foreach ($job in $jobs.jobs) {
        Write-Host "  - Job $($job.id): $($job.status) (Created: $($job.createdAt))" -ForegroundColor Gray
    }
} catch {
    Write-Host "Failed to list jobs: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n✅ Async job testing completed!" -ForegroundColor Green
