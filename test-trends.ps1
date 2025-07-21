# Test script for trend analysis endpoints

$baseUrl = "http://127.0.0.1:8787/api/v1"

# Add a simple auth token for testing (using a test user)
$headers = @{
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE5MDAwMDAwMDB9.test"
    "Content-Type" = "application/json"
}

Write-Host "Testing Trend Analysis Endpoints" -ForegroundColor Green

# Test 1: Industry trends
Write-Host "`n1. Testing industry trends..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/analyze/trends/industry/technology" -Method GET -Headers $headers
    Write-Host "Response: " -NoNewline
    Write-Host $response.Content -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Emerging skills
Write-Host "`n2. Testing emerging skills..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/analyze/trends/skills/emerging" -Method GET -Headers $headers
    Write-Host "Response: " -NoNewline
    Write-Host $response.Content -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Geographic trends
Write-Host "`n3. Testing geographic trends..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/analyze/trends/geographic/north-america" -Method GET -Headers $headers
    Write-Host "Response: " -NoNewline
    Write-Host $response.Content -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Skill forecasts
Write-Host "`n4. Testing skill forecasts..." -ForegroundColor Yellow
try {
    $body = @{
        skill_names = @("React", "TypeScript", "AWS")
        industry = "technology"
        region = "north-america"
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "$baseUrl/analyze/trends/forecast" -Method POST -Headers $headers -Body $body
    Write-Host "Response: " -NoNewline
    Write-Host $response.Content -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Declining skills
Write-Host "`n5. Testing declining skills..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/analyze/trends/skills/declining" -Method GET -Headers $headers
    Write-Host "Response: " -NoNewline
    Write-Host $response.Content -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Skill growth velocity
Write-Host "`n6. Testing skill growth velocity..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/analyze/trends/skills/velocity" -Method GET -Headers $headers
    Write-Host "Response: " -NoNewline
    Write-Host $response.Content -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n✅ All tests completed!" -ForegroundColor Green
