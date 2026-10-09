# Forgejo Test Action

this is a repo for testing forgejo actions and pulling them from an online repo

Overlay URLs can be regular Git clone URLs. To use a directory from a GitHub
repository, append its repository-relative path and `@<branch>`, for example:

```text
https://github.com/WeicJa210116/ForgejoTestActions/overlays/testOverlay@overlays
```

This clones the `overlays` branch and sparsely checks out
`overlays/testOverlay` under `overlays/testOverlay/`.