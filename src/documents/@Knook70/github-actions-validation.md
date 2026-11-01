---javascript
({ title: (() => { throw new Error("UNTRUSTED_FRONTMATTER_EXECUTED"); })() })
---

This JavaScript frontmatter must be rejected without execution.
