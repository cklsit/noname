# Automatic iOS deployment to a laptop-hosted iPad

The `ios-test-build.yml` workflow can optionally hand its unsigned IPA to a
self-hosted macOS runner on the same LAN as the target iPad. The runner invokes
the modified built-in SideStore from LiveContainer, verifies SHA-256, uninstalls
`com.libnoname.noname`, installs the new IPA, and cleans up the local copy.

## One-time prerequisites

1. Install the modified `LiveContainer+SideStore.ipa` produced from:
   - LiveContainer branch: `feat/noname-auto-deploy`
   - SideStore branch: `feat/noname-auto-deploy`
2. Sign in to built-in SideStore and verify its signing certificate.
3. Import a valid pairing file and keep LocalDevVPN available.
4. Pair the iPad with the macOS runner through Xcode `devicectl`.
5. Register the macOS machine as a repository-level self-hosted runner with
   labels `macOS` and `noname-ios-deploy`.

The initial installation of the modified LiveContainer+SideStore app is a
physical bootstrap step. After that, Noname deployments can be triggered from
GitHub Actions.

## Trigger

Run **Build test iOS IPA** from the GitHub Actions UI and enable
`deploy_to_ipad`.

Optional inputs:

- `ipad_device_id`: the `devicectl` identifier. When omitted, the runner requires
  exactly one paired iPad.
- `ipad_host`: the iPad LAN host. When omitted, the runner discovers
  `_noname-deploy._tcp` through Bonjour.

## Safety properties

- The deployment service is disabled until configured with a per-run secret.
- Requests use HMAC-SHA256, a short timestamp window, and a one-time nonce.
- Only the exact bundle ID `com.libnoname.noname` is accepted.
- The iPad verifies the IPA SHA-256 before uninstalling the existing app.
- The local IPA is deleted after the deployment attempt.

## Failure conditions

Deployment stops rather than guessing when:

- more than one paired iPad is visible and no device ID was supplied;
- the device is offline or locked;
- LocalDevVPN is unavailable;
- the signing certificate or Apple Account session is invalid;
- the iPad cannot resolve or reach the temporary LAN IPA server;
- SHA-256 verification fails;
- SideStore reports an uninstall or install error.

Never run this job on an untrusted self-hosted runner because it can access
paired devices and the local network.
