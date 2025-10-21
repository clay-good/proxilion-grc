# Self-Service Pattern Management

## Overview

Proxilion provides **self-service pattern management** that allows organizations to customize PII detection patterns, adjust sensitivity levels, and create custom detection rules **without code changes or redeployment**.

This enables security teams to:
- ✅ **Tune detection patterns** to reduce false positives
- ✅ **Add custom patterns** for organization-specific sensitive data
- ✅ **Adjust severity levels** based on risk tolerance
- ✅ **Enable/disable patterns** in real-time
- ✅ **Test patterns** before deploying to production

---

## 🎯 Key Features

### 1. Real-Time Pattern Updates

Changes take effect **immediately** without restarting Proxilion:

```bash
# Enable/disable a pattern
PATCH /api/security/pii-patterns/Credit%20Card%20Number%20(Visa)
{
  "enabled": false
}

# Response: Pattern disabled immediately
# Next request will NOT scan for Visa cards
```

### 2. Custom Pattern Creation

Add organization-specific patterns:

```bash
POST /api/security/pii-patterns
{
  "name": "Employee ID",
  "pattern": "EMP-\\d{6}",
  "category": "identity",
  "severity": "HIGH",
  "complianceStandards": ["SOX", "Internal Policy"],
  "description": "Company employee ID format",
  "enabled": true
}
```

### 3. Severity Adjustment

Tune severity levels based on your risk tolerance:

```bash
PATCH /api/security/pii-patterns/Email%20Address
{
  "severity": "LOW"  # Changed from MEDIUM to LOW
}
```

### 4. Regex Customization

Modify detection patterns for better accuracy:

```bash
PATCH /api/security/pii-patterns/Phone%20Number
{
  "regex": "\\+1[\\s-]?\\(?\\d{3}\\)?[\\s-]?\\d{3}[\\s-]?\\d{4}"
}
```

### 5. Bulk Operations

Update multiple patterns at once:

```bash
POST /api/security/pii-patterns/bulk-update
{
  "updates": [
    { "name": "Credit Card Number (Visa)", "enabled": true },
    { "name": "Credit Card Number (Mastercard)", "enabled": true },
    { "name": "Credit Card Number (Amex)", "enabled": false }
  ]
}
```

---

## 📊 Pattern Categories

Proxilion organizes patterns into 6 categories:

| Category | Description | Default Patterns | Use Cases |
|----------|-------------|------------------|-----------|
| **Financial** | Credit cards, bank accounts, routing numbers | 8 patterns | PCI-DSS compliance |
| **Identity** | SSN, driver licenses, passports, tax IDs | 6 patterns | HIPAA, GLBA compliance |
| **Contact** | Email, phone numbers, IP addresses | 5 patterns | GDPR, CCPA compliance |
| **Health** | Medicare IDs, NPI, DEA numbers | 4 patterns | HIPAA compliance |
| **Government** | Military IDs, VINs, government IDs | 3 patterns | Federal compliance |
| **Biometric** | Biometric identifiers | 2 patterns | Privacy regulations |

---

## 🔧 API Reference

### Get All Patterns

```bash
GET /api/security/pii-patterns

Response:
{
  "success": true,
  "data": [
    {
      "name": "Credit Card Number (Visa)",
      "category": "financial",
      "severity": "CRITICAL",
      "enabled": true,
      "complianceStandards": ["PCI-DSS"],
      "description": "Visa credit card number (starts with 4)",
      "regex": "\\b4\\d{3}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b"
    },
    ...
  ]
}
```

### Get Single Pattern

```bash
GET /api/security/pii-patterns/Credit%20Card%20Number%20(Visa)

Response:
{
  "success": true,
  "data": {
    "name": "Credit Card Number (Visa)",
    "category": "financial",
    "severity": "CRITICAL",
    "enabled": true,
    "complianceStandards": ["PCI-DSS"],
    "description": "Visa credit card number (starts with 4)",
    "regex": "\\b4\\d{3}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b"
  }
}
```

### Update Pattern

```bash
PATCH /api/security/pii-patterns/Email%20Address
{
  "enabled": false,
  "severity": "LOW",
  "regex": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
}

Response:
{
  "success": true,
  "message": "Pattern updated successfully",
  "data": {
    "name": "Email Address",
    "enabled": false,
    "severity": "LOW",
    "regex": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
  }
}
```

### Create Custom Pattern

```bash
POST /api/security/pii-patterns
{
  "name": "Internal Project Code",
  "pattern": "PROJ-[A-Z]{3}-\\d{4}",
  "category": "identity",
  "severity": "MEDIUM",
  "complianceStandards": ["Internal Policy"],
  "description": "Internal project code format",
  "enabled": true
}

Response:
{
  "success": true,
  "message": "Custom pattern created successfully",
  "data": {
    "name": "Internal Project Code",
    "pattern": "PROJ-[A-Z]{3}-\\d{4}",
    "category": "identity",
    "severity": "MEDIUM",
    "complianceStandards": ["Internal Policy"],
    "description": "Internal project code format",
    "enabled": true
  }
}
```

### Delete Custom Pattern

```bash
DELETE /api/security/pii-patterns/Internal%20Project%20Code

Response:
{
  "success": true,
  "message": "Custom pattern deleted successfully",
  "data": {
    "name": "Internal Project Code"
  }
}
```

### Bulk Update

```bash
POST /api/security/pii-patterns/bulk-update
{
  "updates": [
    { "name": "Credit Card Number (Visa)", "enabled": true },
    { "name": "Credit Card Number (Mastercard)", "enabled": true },
    { "name": "US Social Security Number", "enabled": true },
    { "name": "Email Address", "enabled": false }
  ]
}

Response:
{
  "success": true,
  "message": "4 patterns updated successfully",
  "data": {
    "count": 4
  }
}
```

### Reset to Defaults

```bash
POST /api/security/pii-patterns/reset

Response:
{
  "success": true,
  "message": "Patterns reset to defaults successfully"
}
```

### Get Pattern Categories

```bash
GET /api/security/categories

Response:
{
  "success": true,
  "data": [
    {
      "id": "financial",
      "name": "Financial Data",
      "description": "Credit cards, bank accounts, routing numbers",
      "patternCount": 8,
      "enabled": true
    },
    ...
  ]
}
```

### Test Pattern

```bash
POST /api/security/test-pattern
{
  "pattern": "\\b4\\d{3}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b",
  "testString": "My credit card is 4532-1234-5678-9010"
}

Response:
{
  "success": true,
  "data": {
    "matches": ["4532-1234-5678-9010"],
    "count": 1,
    "valid": true
  }
}
```

---

## 🎨 Web UI Integration

The Security Controls page (`/security`) provides a visual interface for pattern management:

### Features

1. **Pattern List**
   - View all 30+ built-in patterns
   - Filter by category (financial, identity, contact, etc.)
   - Filter by severity (CRITICAL, HIGH, MEDIUM, LOW)
   - Search by pattern name

2. **Toggle Enable/Disable**
   - Click toggle switch to enable/disable patterns
   - Changes apply immediately
   - Visual feedback on status

3. **Edit Pattern**
   - Click "Edit" button to modify pattern
   - Update severity level
   - Modify regex pattern
   - Test pattern before saving

4. **Create Custom Pattern**
   - Click "Add Custom Pattern" button
   - Fill in pattern details
   - Test regex before creating
   - Assign to category and compliance standards

5. **Bulk Operations**
   - Select multiple patterns
   - Enable/disable in bulk
   - Export/import pattern configurations

---

## 🚀 Use Cases

### Use Case 1: Reduce False Positives

**Problem**: Email pattern triggers too many false positives

**Solution**:
```bash
# Disable email detection temporarily
PATCH /api/security/pii-patterns/Email%20Address
{
  "enabled": false
}

# Or reduce severity
PATCH /api/security/pii-patterns/Email%20Address
{
  "severity": "LOW"
}
```

### Use Case 2: Add Company-Specific Pattern

**Problem**: Need to detect internal employee IDs

**Solution**:
```bash
POST /api/security/pii-patterns
{
  "name": "Employee ID",
  "pattern": "EMP-\\d{6}",
  "category": "identity",
  "severity": "HIGH",
  "complianceStandards": ["Internal Policy"],
  "description": "6-digit employee ID with EMP prefix"
}
```

### Use Case 3: Compliance-Specific Configuration

**Problem**: HIPAA audit requires stricter PHI detection

**Solution**:
```bash
# Enable all health-related patterns
POST /api/security/pii-patterns/bulk-update
{
  "updates": [
    { "name": "Medicare Beneficiary Identifier (MBI)", "enabled": true },
    { "name": "National Provider Identifier (NPI)", "enabled": true },
    { "name": "DEA Number", "enabled": true }
  ]
}

# Increase severity
PATCH /api/security/pii-patterns/Medicare%20Beneficiary%20Identifier%20(MBI)
{
  "severity": "CRITICAL"
}
```

---

## ⚡ Performance Impact

Pattern updates have **minimal performance impact**:

- **Update latency**: <1ms
- **No restart required**: Changes apply immediately
- **No downtime**: Existing requests continue processing
- **Cached results**: Scan cache automatically invalidated

---

## 🔒 Security Considerations

1. **Authentication Required**: All pattern management APIs require API key
2. **Audit Logging**: All pattern changes are logged for compliance
3. **Validation**: Regex patterns are validated before applying
4. **Rollback**: Can reset to defaults if needed
5. **Testing**: Test patterns before deploying to production

---

## 📈 Best Practices

1. **Test Before Deploying**
   - Use `/api/security/test-pattern` to validate regex
   - Test with sample data before enabling

2. **Start Conservative**
   - Enable patterns gradually
   - Monitor false positive rate
   - Adjust severity as needed

3. **Document Custom Patterns**
   - Add clear descriptions
   - Link to compliance requirements
   - Include test cases

4. **Regular Review**
   - Review enabled patterns quarterly
   - Remove unused custom patterns
   - Update regex for accuracy

5. **Monitor Performance**
   - Check scan latency after adding patterns
   - Optimize complex regex patterns
   - Use caching for frequently scanned content

---

## 🎓 Next Steps

1. **Explore the Web UI**: Visit `/security` to manage patterns visually
2. **Create Custom Patterns**: Add organization-specific detection rules
3. **Test Patterns**: Use the test endpoint to validate regex
4. **Monitor Results**: Check dashboard for detection statistics
5. **Tune Sensitivity**: Adjust severity levels based on your needs

---

**Related Documentation**:
- [Complete Solution Guide](COMPLETE_SOLUTION_GUIDE.md)
- [API Reference](API_REFERENCE.md)
- [Performance Optimization](PERFORMANCE_OPTIMIZATION.md)

