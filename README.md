# Buildalon Activate Unity License

[![Discord](https://img.shields.io/discord/939721153688264824.svg?label=&logo=discord&logoColor=ffffff&color=7389D8&labelColor=6A7EC2)](https://discord.gg/VM9cWJ9rjH) [![marketplace](https://img.shields.io/static/v1?label=&labelColor=505050&message=Buildalon%20Actions&color=FF1E6F&logo=github-actions&logoColor=0076D6)](https://github.com/marketplace?query=buildalon) [![actions](https://github.com/buildalon/activate-unity-license/actions/workflows/validate.yml/badge.svg?branch=main&event=push)](https://github.com/buildalon/activate-unity-license/actions/workflows/validate.yml)

A GitHub Action to activate a [Unity Game Engine](https://unity.com) license for CI/CD workflows.

## How to use

This action uses your stored environment secrets to authenticate with the Unity Licensing servers.

***It's important that you disable other forks of your repository to run actions in pull requests from unknown contributors.***

> Read more on [Approving workflow runs from public forks](
https://docs.github.com/en/actions/managing-workflow-runs/approving-workflow-runs-from-public-forks)

[![Managing GitHub Actions settings for a repository](RecommendedSecuritySettings.png)](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)

### inputs

This action requires several secrets that need to be setup in the repository or organization's action secret store.

* `UNITY_USERNAME`: The ***email address*** you use for your Unity Id.
* `UNITY_PASSWORD`: The ***password*** you use for Unity Id access.
* `UNITY_SERIAL`: The ***Serial number*** for the seat.
* `UNITY_SERVICES_CONFIG`: Unity License Client `services-config.json` as a path, raw json, or base64 string.

> [!IMPORTANT]
> Don't forget that Professional licenses only support 2 activations at a time!

| name | description | required |
| ---- | ----------- | -------- |
| `license` | Must be one of `personal`, `professional`, or `floating`. | Defaults to `personal` |
| `username` | The ***email address*** you use for your Unity Id | Required for `personal`, `professional` license activations |
| `password` | The ***password*** you use for Unity Id access | Required for `personal` and `professional` license activations |
| `serial` | The ***Serial number*** for the seat | Required for `professional` license activations, but not named seats. |
| `configuration` | Unity License Client `services-config.json` path, raw json, or json encoded as base64 string. | Required for `floating` license activations |
| `return-license` | When the post step returns the license: `auto`, `always`, or `never`. `never` on a `professional` license warns that the seat stays held. | Defaults to `auto` |
| `services-config` | ***Deprecated***, same as `configuration`. | No |
| `license-version` | ***Deprecated***, the license version is detected from the installed editor. | No |

When `username` or `password` is empty, the action reads them base64 encoded from the `UNITY_USERNAME_BASE64` and `UNITY_PASSWORD_BASE64` environment variables.

### license return

With `return-license: auto`, the post step returns the license when the job ends, except a `personal` license on GitHub-hosted macOS and Linux runners. Those runners share one machine identity with Unity, so a return there revokes the license for every other job on that identity, other repositories' included.

| runner | `personal` | `professional` | `floating` |
| ------ | ---------- | -------------- | ---------- |
| GitHub-hosted Windows | returned | returned | released |
| GitHub-hosted macOS and Linux | ***not returned*** | returned | released |
| self-hosted | returned | returned | released |

`always` returns the license on every runner, and `never` keeps it on every runner. Floating licenses always release their lease.

### seat usage

Each paid seat allows 2 activations, and every GitHub-hosted macOS job shares one machine identity, as does every Linux job. A `professional` license that isn't returned keeps holding one of those activations, and a runner image update can change the identity and orphan it. When activations run out, activation fails and the action warns. Release them at [id.unity.com](https://id.unity.com) under ***My Seats***.

### cached license file

Set the `UNITY_LICENSE` environment variable to a `Unity_lic.ulf` path, its raw XML, or base64 to activate from a license file activated earlier on a machine with the same identity. The action signs in with the account when the file can't be used.

### retryable failures

When activation fails because no seats are free or the network dropped, the action adds a notice titled `unity-license-exhausted` or `unity-transient-failure`. [retry-failed-jobs](https://github.com/buildalon/retry-failed-jobs) can rerun the job on those markers.

### workflow

```yaml
steps:
  - uses: buildalon/activate-unity-license@v3
    with:
      license: 'personal' # Choose license type to use [ personal, professional, floating ]
      username: ${{ secrets.UNITY_USERNAME }}
      password: ${{ secrets.UNITY_PASSWORD }}
      # serial: ${{ secrets.UNITY_SERIAL }} # Required for pro activations
      # configuration: ${{ secrets.UNITY_SERVICES_CONFIG }} # Required for floating license activations
```

### upgrading from v2

* A `personal` license is no longer returned on GitHub-hosted macOS and Linux runners; use `return-license` to change it.
* `license-version` is ignored; 4.x and 5.x licenses are detected from the editor installed by an earlier step.
* Activation goes through the official Unity CLI first, then the Unity Licensing Client; Unity Hub is no longer required.
