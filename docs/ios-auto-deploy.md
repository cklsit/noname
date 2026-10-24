# Automatic iOS Nightly Release and LAN iPad deployment

The iOS workflow can build the current `feat/ios-integration` branch, publish
the unsigned IPA to the prerelease `nightly` tag, and install that same IPA on
a LAN iPad through the modified built-in SideStore.

## One-time prerequisites

1. Install the modified `LiveContainer+SideStore.ipa` produced from:
   - LiveContainer branch: `feat/noname-auto-deploy`
   - SideStore branch: `feat/noname-auto-deploy`
2. Sign in to built-in SideStore and verify its signing certificate.
3. Import a valid pairing file and keep LocalDevVPN installed and authorized.
4. Establish a one-time RemotePairing trust relationship between the iPad and
   the Linux runner.
5. Register the Linux machine as a self-hosted runner with the label
   `noname-ios-deploy`.

The initial LiveContainer+SideStore installation is a physical bootstrap step.
Later Noname builds and deployments can run automatically.

## Nightly chain

The default-branch `sync-upstream.yml` workflow runs at 00:00 Asia/Shanghai.
After `feat/ios-integration` is synchronized, it dispatches this workflow with:

- `publish_nightly=true`
- `deploy_to_ipad=true`

The resulting sequence is:

1. synchronize `feat/ios-integration` with upstream;
2. build the unsigned slim IPA;
3. update the `nightly` prerelease and replace its IPA assets;
4. download the same build artifact on the LAN runner;
5. wake the iPad and launch LocalDevVPN, respecting `Auto-connect on Launch`;
6. verify the IPA hash, fully uninstall the old app, and let SideStore install
   the new build;
7. delete the runner IPA and the successful GitHub Actions artifact.

## Manual trigger

Run **Build test iOS IPA** with any of these options:

- `publish_nightly`: update the `nightly` release;
- `deploy_to_ipad`: install on the LAN iPad;
- `ipad_device_id`: optional trusted pairing UDID override;
- `ipad_host`: optional SideStore endpoint override.

For unattended push deployment, set repository variable
`NONAME_AUTO_DEPLOY=true`. Store the target device and optional endpoint in
`NONAME_IOS_DEVICE_ID` and `NONAME_IOS_HOST` repository secrets.

## Safety properties

- Artifact names include the source commit short hash.
- `localdevvpn://enable` is used only as a fallback when no `utun` exists.
- The runner retries transient RemotePairing failures and waits for the device.
- A power assertion and keep-awake loop prevent normal idle sleep.
- Requests use HMAC-SHA256, a short timestamp window, and a one-time nonce.
- Only `com.libnoname.noname` is accepted.
- The iPad verifies the IPA SHA-256 before uninstalling the existing app.
- Stale IPA assets are removed so `nightly` contains only the current build.
- The runner IPA and successful GitHub Actions artifact are deleted.

## Failure conditions

Deployment stops instead of guessing when:

- the branch synchronization has a merge conflict;
- the device is offline or passcode-locked;
- LocalDevVPN cannot create a `utun` interface;
- the signing certificate or Apple Account session is invalid;
- SHA-256 verification fails;
- SideStore reports an uninstall or install error.

A powered-off iPad, disabled Wi-Fi, or passcode-locked screen cannot be
bypassed by the runner.
