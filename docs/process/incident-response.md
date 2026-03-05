# Incident Response Runbook

> GearSwitchr production incident playbook for Oscar and human responders.

**Stack reference:**
- ECS cluster: `gs-production-cluster` / service: `gs-production-api`
- ALB: `gs-production-alb-732691074.us-east-1.elb.amazonaws.com`
- CloudFront distribution: `E1M53SHCRU4YT8`
- RDS: PostgreSQL (see ECS env vars for connection string)
- Health endpoint: `https://api.gearswitchr.com/health`

---

## 1. Detection

An incident may be detected through any of:

| Source | Signal |
|---|---|
| **Health check** | `GET https://api.gearswitchr.com/health` returns non-200 or times out |
| **CloudWatch alarms** | ECS task count drops to 0, ALB 5xx spike, RDS connection errors |
| **User reports** | Discord `#gearswitchr-support` messages about errors or downtime |

Oscar polls the health endpoint periodically. On failure, Oscar notifies Reuben immediately via Discord.

---

## 2. Triage

Run through this checklist to identify the failure layer:

### ECS Task Crash
- Check running task count: `aws ecs describe-services --cluster gs-production-cluster --services gs-production-api`
- If `runningCount: 0` or < desired, tasks are crashing on startup or being stopped.
- Check stopped task logs in CloudWatch Logs group `/ecs/gs-production-api`.

### RDS Connection Failure
- Health check returns 503 with DB error in body.
- Check RDS instance status in console or via `aws rds describe-db-instances`.
- Check ECS task logs for `could not connect to server` or `too many connections`.

### DNS / CloudFront Issue
- API is healthy but frontend can't reach it, or `gearswitchr.com` resolves wrong.
- Check Route 53 hosted zone records for `api.gearswitchr.com`.
- Check CloudFront distribution `E1M53SHCRU4YT8` for disabled state or bad origin config.

### Cognito Auth Failure
- Users can't log in but API health check passes.
- Check AWS Cognito User Pool status and recent error rates in CloudWatch.

### Amplify Frontend Failure
- API is fine but app won't load.
- Check Amplify app build/deploy status in AWS console.
- Check CloudFront distribution for frontend serving errors.

---

## 3. Escalation

```
Incident detected
      ↓
Oscar notifies Reuben via Discord (immediate)
      ↓
Reuben investigates (up to 15 min)
      ↓
Unresolved after 15 min → Oscar pings Isaac
```

Oscar's Discord notification includes:
- Timestamp
- Failing health check URL or alarm name
- Last known error from logs (if available)
- Link to CloudWatch log stream

---

## 4. Resolution

### ECS Task Crash

**Option A — Force new deployment (for transient crashes):**
```bash
aws ecs update-service \
  --cluster gs-production-cluster \
  --service gs-production-api \
  --force-new-deployment
```

**Option B — Rollback to previous task definition:**
Spawn a Developer agent with a rollback task referencing `docs/process/deploy-runbook.md`.

Check the task is running:
```bash
aws ecs describe-services \
  --cluster gs-production-cluster \
  --services gs-production-api \
  --query 'services[0].{running:runningCount,desired:desiredCount}'
```

### RDS Connection Issue

1. Verify RDS instance is available in console.
2. If connection limit hit, exec into a running ECS task and inspect pg connections:
```bash
aws ecs execute-command \
  --cluster gs-production-cluster \
  --task <task-id> \
  --container api \
  --interactive \
  --command "psql $DATABASE_URL -c 'SELECT count(*) FROM pg_stat_activity;'"
```
3. If instance is down, restore from latest snapshot or await AWS resolution.

### DNS / CloudFront

1. Check Route 53 for `api.gearswitchr.com` — verify CNAME or alias points to ALB.
2. If CloudFront is serving stale or broken content:
```bash
aws cloudfront create-invalidation \
  --distribution-id E1M53SHCRU4YT8 \
  --paths "/*"
```
3. Confirm origin config in CloudFront points to correct ALB.

### Cognito

- Check User Pool in AWS console for outage indicator.
- If Cognito is degraded, communicate to users via Discord. No self-remediation available for AWS-side outages.

### Amplify

- Re-trigger a deployment in Amplify console or via `aws amplify start-deployment`.

---

## 5. Rollback

If a bad deployment caused the incident:

1. Identify the previous stable ECS task definition revision.
2. Spawn a Developer agent:
   - Task: "Roll back gs-production-api to task definition revision N"
   - Reference: `docs/process/deploy-runbook.md`
3. The agent will update the ECS service to the previous task definition and force a new deployment.

---

## 6. Post-Mortem Template

Create a post-mortem doc in `docs/postmortems/YYYY-MM-DD-<slug>.md` after any P0/P1 incident.

```markdown
# Post-Mortem: <title>

**Date:** YYYY-MM-DD
**Duration:** X hours Y minutes
**Severity:** P0 / P1 / P2
**Impact:** <who was affected and how>

## Root Cause

<one paragraph describing the technical root cause>

## Timeline

| Time (UTC) | Event |
|---|---|
| HH:MM | Incident detected |
| HH:MM | Triage began |
| HH:MM | Root cause identified |
| HH:MM | Fix deployed |
| HH:MM | Service restored |

## Fix

<what was done to resolve the incident>

## Prevention

- [ ] <action item 1>
- [ ] <action item 2>
```
