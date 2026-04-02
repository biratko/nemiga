# Publishing Nemiga to Snap Store

Step-by-step guide for building and publishing the Nemiga snap package.

## Prerequisites

- Ubuntu or any Linux with `snapd` installed
- `snapcraft` CLI (`sudo snap install snapcraft --classic`)
- Snap Store account at [snapcraft.io](https://snapcraft.io)

## Step 1: Add snap target to electron-builder

In `electron/package.json`, add `"snap"` to `linux.target` and a `snap` section:

```jsonc
// linux section
"linux": {
  "target": ["AppImage", "snap"],
  "category": "System"
},
// new snap section
"snap": {
  "confinement": "strict",
  "grade": "stable",
  "plugs": [
    "home",
    "removable-media",
    "network"
  ]
}
```

## Step 2: Add build script

In `electron/package.json` scripts:

```json
"dist:snap": "node build.js && electron-builder --linux snap"
```

And in the root `Makefile`:

```makefile
dist-electron-snap:
	cd electron && npm run dist:snap
```

## Step 3: Build the snap

```bash
make build                # build frontend + backend
make dist-electron-snap   # build snap package
```

The `.snap` file will appear in `electron/dist/`.

## Step 4: Log in to Snap Store

```bash
snapcraft login
```

Follow the browser prompt to authenticate.

## Step 5: Register the snap name (once)

```bash
snapcraft register nemiga
```

If the name is taken, choose an alternative (e.g. `nemiga-fm`).

## Step 6: Upload to Snap Store

```bash
snapcraft upload --release=edge electron/dist/nemiga_0.1.0_amd64.snap
```

Start with the `edge` channel for testing.

## Step 7: Test the published snap

```bash
sudo snap install nemiga --edge
nemiga
```

## Step 8: Promote to stable

Once validated, promote through channels:

```bash
snapcraft release nemiga <revision> beta
snapcraft release nemiga <revision> candidate
snapcraft release nemiga <revision> stable
```

Get the revision number from `snapcraft upload` output or `snapcraft revisions nemiga`.

## Snap channels

| Channel     | Purpose                        |
|-------------|--------------------------------|
| `edge`      | Latest builds, may be unstable |
| `beta`      | Feature-complete, testing      |
| `candidate` | Release candidate, final QA    |
| `stable`    | Production releases            |

## Confinement notes

- `strict` — sandboxed, needs declared plugs for filesystem/network access
- `classic` — full system access (requires manual Snap Store approval)
- `home` plug grants access to `$HOME`; `removable-media` grants `/media`, `/mnt`, `/run/media`
- If the file manager needs access beyond home/removable, `classic` confinement may be necessary — but it requires a review process from the Snap team

## Useful commands

```bash
snapcraft whoami              # check login status
snapcraft revisions nemiga    # list all uploaded revisions
snapcraft status nemiga       # show channel map
snapcraft close nemiga edge   # close a channel
```
