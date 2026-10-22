# Automatic iOS deployment to a LAN iPad

The `ios-test-build.yml` workflow can optionally hand its unsigned IPA to a
self-hosted Linux runner on the same LAN as the target iPad. The runner invokes
the modified built-in SideStore from LiveContainer through `pymobiledevice3`,
verifies SHA-256, uninstalls `com.libnoname.noname`, installs the new IPA, and
cleans up the runner copy and successful build artifact.

## One-time prerequisites

1. Install the modified `LiveContainer+SideStore.ipa` produced from:
   - LiveContainer branch: `feat/noname-auto-deploy`
   - SideStore branch: `feat/noname-auto-deploy`
2. Sign in to built-in SideStore and verify its signing certificate.
3. Import a valid pairing file and keep LocalDevVPN available.
4. Establish a one-time RemotePairing trust relationship between the iPad and
   the Linux runner, then confirm that `pymobiledevice3` can launch apps on it.
5. Register the Linux machine as a repository-level self-hosted runner with the
   label `noname-ios-deploy`.

The initial installation of the modified LiveContainer+SideStore app is a
physical bootstrap step. After that, Noname deployments can be triggered from
GitHub Actions.

## Trigger

Run **Build test iOS IPA** from the GitHub Actions UI and enable
`deploy_to_ipad`.

For unattended push deployments, define repository variable
`NONAME_AUTO_DEPLOY=true`. Store `NONAME_IOS_DEVICE_ID` and optional
`NONAME_IOS_HOST` as repository secrets so workflow-dispatch and push runs use
the same target without exposing the device ID or LAN address in the workflow.

Optional inputs:

- `ipad_device_id`: the trusted pairing UDID. Set this in production orchestration
  or secret `NONAME_IOS_DEVICE_ID` to avoid ambiguity. When both are empty, the runner
  requires exactly one paired iPad.
- `ipad_host`: the iPad LAN host. When omitted, the runner discovers
  `_noname-deploy._tcp` through Bonjour. Secret `NONAME_IOS_HOST` provides the same
  unattended override.

## Safety properties

- The deployment service is disabled until configured with a per-run secret.
- Requests use HMAC-SHA256, a short timestamp window, and a one-time nonce.
- Only the exact bundle ID `com.libnoname.noname` is accepted.
- The iPad verifies the IPA SHA-256 before uninstalling the existing app.
- The local IPA is deleted after the deployment attempt.
- The GitHub Artifact is deleted after a successful deployment.

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
