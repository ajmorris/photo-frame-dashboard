# Pastigio FRAME156 15.6" Frameo frame

Third device, separate from the Skylight 150-CAL and the BIUFRAME. Notes are for this one unit
(2026-10-11). Observations are kept separate from guesses.

This is a **Frameo** frame: the vendor app is `net.frameo.frame` (the same Frameo software used by
many brands), not a brand-specific app like Skylight or Biu Frame. The Frameo-specific part is how
ADB is enabled; everything after that is ordinary Android.

## Identity

| Item | Value |
| --- | --- |
| Product | Pastigio FRAME156, 15.6" |
| Build fingerprint | `rockchip/rk3326_32bit/rk3326_32bit:8.1.0/OC/192521:user/release-keys` |
| Android | 8.1.0, SDK 27 |
| Build date | Tue May 12 19:25:21 CST 2026 |
| Model / device / brand | `FRAME156` / `FRAME156` / `Pastigio` (manufacturer `rockchip`) |
| SoC / platform | Rockchip RK3326, `ro.board.platform=rk3326`, `ro.hardware=rk30board` |
| ABI | `armeabi-v7a` (32-bit userspace) |
| Display | 1920x1080, density 170 |
| Flash | eMMC `mmcblk2`, 61,071,360 sectors of 512 bytes (~29.1 GiB) |
| `ro.serialno` | `7E631001` (ADB serial is different: `4NAY7EM2BE`) |
| `androidboot.serialno` | `c3d9b8674f4b94f6` (from `/proc/cmdline`) |
| USB identity | `FRAME156`, VID:PID `2218:0006`, rev `0310`, 480 Mbps |
| SELinux | **Permissive** (`androidboot.selinux=permissive`) |
| Root | **Ships rooted.** `su -c id` returns `uid=0(root) ... context=u:r:toolbox:s0` |
| `ro.adb.secure` / `ro.secure` / `ro.debuggable` | `1` / `1` / `0` |
| Frameo app | v1.30.19 (69880), minSdk 23, targetSdk 34, `/system/priv-app/DP_Frameo/DP_Frameo.apk` |

Note the USB vendor ID is `0x2218`, **not** Rockchip's usual `0x2207` as seen on the Skylight and
the BIUFRAME. The product ID `0x0006` does match the Rockchip ADB convention on both of those.

## Ports

Reset pinhole was not identified. Physical ports: microSD, USB-A, USB-C, 3.5 mm mic/headphone.
The USB-A port is a host port. The USB-C port is device-capable (it is what enumerates as
`FRAME156`) and also accepts power. The frame can run from a wall adapter and the Mac cable at the
same time.

## Getting ADB (the Frameo method)

**On the frame: Settings -> About -> Enable Beta Program.** Toggle it on. It did not ask for a
network, an account, or Wi-Fi. If an "ADB Access" toggle appears, cycling it On-Off-On is the
documented fix for a device stuck at `unauthorized`.

Source, which also covers other Frameo frames:
https://docs.immichkiosk.app/misc/frameo/ (already linked from [biuframe.md](biuframe.md) for its
WebView method). Its compatible-device list includes a "Pastigio M15R5 (Android 8.0.1)", so this
family is known to the Frameo modding community.

After enabling it, accept the **Allow USB debugging** prompt on the frame and tick
**Always allow from this computer**. `persist.sys.usb.config` and `sys.usb.config` are then both
`adb`, so ADB survives reboots.

### The 150 ms dropout, before Beta Program was enabled

Worth recording because it looks like a hardware or cable fault and is not one. Before the Beta
Program toggle, the frame would enumerate on the USB bus and then disappear:

```
22:30:40.998  enumerated 0x2218/0006/0310 (FRAME156 / 1) at 480 Mbps
22:30:45.720  adb: failed to open — already opened by AppleUSBHostCompositeDevice
22:30:45.726  endpoint 0x00: status 0xe0005000 (pipe stalled)
22:30:45.747  endpoint 0x81: status 0xe00002ed (transaction error)
22:30:45.868  terminateDevice: destroying (FRAME156): hardware connection lost
```

Observations:

- Six separate enumerations lasted 126, 142, 154, 155, 153 and 152 ms. The tight clustering argues
  against a marginal cable, which fails with scattered timing.
- Each fresh plug event produced **exactly two** attempts about 5 seconds apart, then silence.
  Waiting without replugging never produced another.
- `adb` reached `unauthorized` during one window, so `adbd` was alive and the handshake worked.
- macOS `adb` polls for USB devices on the order of a second, so a 150 ms window is usually invisible
  to `adb devices` even though the kernel logs it.

Useful diagnostic on macOS, since `adb devices` shows nothing:

```sh
/usr/bin/log stream --style compact --predicate 'eventMessage CONTAINS "FRAME156"'
```

(Use `/usr/bin/log`; `log` is a zsh builtin.) Cause not confirmed. Candidates considered: Type-C
dual-role port flip-flopping (the port is `usb-drd0`), macOS `icdd`/Image Capture grabbing the
device as the pipe stalls, and device-side gadget teardown. Enabling Beta Program is what made the
link hold; which of those it addressed was not established. Powering the frame from a wall adapter
versus from the Mac made no difference.

## Partition layout

eMMC `mmcblk2`. Offsets and sizes in 512-byte sectors, from
`/sys/block/mmcblk2/mmcblk2pN/{start,size}`. `by-name` symlinks confirmed each mapping.

| Name | Part | Start | Size | Size (MiB) |
| --- | --- | --- | --- | --- |
| (IDBlock / loader) | — | 0 | 16384 | 8 |
| uboot | p1 | 16384 | 8192 | 4 |
| trust | p2 | 24576 | 8192 | 4 |
| misc | p3 | 32768 | 8192 | 4 |
| resource | p4 | 40960 | 32768 | 16 |
| kernel | p5 | 73728 | 65536 | 32 |
| boot | p6 | 139264 | 77824 | 38 |
| recovery | p7 | 217088 | 143360 | 70 |
| backup | p8 | 360448 | 229376 | 112 |
| security | p9 | 589824 | 8192 | 4 |
| cache | p10 | 598016 | 786432 | 384 |
| system | p11 | 1384448 | 3145728 | 1536 |
| metadata | p12 | 4530176 | 32768 | 16 |
| vendor | p13 | 4562944 | 786432 | 384 |
| oem | p14 | 5349376 | 262144 | 128 |
| frp | p15 | 5611520 | 1024 | 0.5 |
| userdata | p16 | 5612544 | 55458752 | ~27,080 |

Mounted read-only: `p11` on `/system`, `p13` on `/vendor`, `p14` on `/oem`.
`/data` is `p16`, 26 GB with 1% used. `/system` is 1.4 GB with 652 MB free.

## Backup (2026-10-11)

Sectors 0 to 5,612,543, i.e. everything before `userdata`, including the Rockchip IDBlock in the
first 8 MiB. `userdata` (~27 GB of photos and Wi-Fi settings) is **not** included.

| Check | Result |
| --- | --- |
| Raw bytes | 2,873,622,528 (`bs=4096 count=701568`) |
| Raw SHA-256 | `30c702232122b62faf09bfab8a736e434d0a0480a7f974fc7fb57ba3a1114652` |
| Independent device-side re-read | same SHA-256 |
| Compressed | 568,465,563 bytes, `backups/pastigio-frame156/emmc-0-5612544.img.gz` |
| gzip readback | verified (decompressed to the exact byte count and hash) |
| Longest `0xCC` run | 46 bytes; no 64 KiB filler runs |
| Non-zero content | 883,315,992 bytes of 2,873,622,528 (30.7%) |
| Slice re-reads matching the backup | uboot, boot, recovery, cache, system, metadata, vendor, oem |
| Transfer time | about 12 minutes |

### Gotcha: `su` corrupts binary output through `adb exec-out`

**The `adb exec-out "su -c 'dd ...'"` pattern used by
[`scripts/biuframe-setup.sh`](../scripts/biuframe-setup.sh) (line 116) silently corrupts binary data
on this device.** This unit's `su` allocates a PTY, which translates LF to CRLF. A 1 MiB read came
back as 1,051,440 bytes instead of 1,048,576: 2,864 extra bytes, and a different hash. The BIUFRAME's
SuperSU `su` on Android 6 does not do this, which is why the existing script works there.

Always pilot a small read and compare against a device-side hash before trusting a full dump:

```sh
# device-side reference, computed on the frame, only the hash crosses USB
adb shell "su -c 'dd if=/dev/block/mmcblk2 bs=4096 count=256 2>/dev/null | sha256sum'"
```

Three transfer methods tested against that reference:

| Method | Bytes | Result |
| --- | --- | --- |
| `adb exec-out "su -c 'dd ...'"` | 1,051,440 | **corrupted** |
| `su -c 'dd ... \| base64'` then `base64 -D` locally | 1,048,576 | ok |
| `dd ... of=/data/local/tmp/f` then `adb pull` | 1,048,576 | ok |

The base64 route was used for the full backup because the dd-to-file route would write ~2.7 GB into
`userdata` on the frame. Piping through `gzip -1` before base64 makes the transfer smaller than raw
despite base64's 33% overhead:

```sh
adb exec-out "su -c 'dd if=/dev/block/mmcblk2 bs=4096 count=701568 2>/dev/null | gzip -1 | base64'" \
  | base64 -D > emmc-0-5612544.img.gz
```

### Gotcha: 32-bit `dd` cannot seek past 2 GiB

Userspace is `armeabi-v7a`, and `dd` fails with `dd: /dev/block/mmcblk2: Invalid argument` for any
byte offset at or beyond 2 GiB (2^31). `skip=5349376` with `bs=512` is 2.74 GB and fails; the
sequential full-range read is unaffected because it never seeks.

To read a region past 2 GiB from the whole-disk device, skip on a pipe instead of seeking:

```sh
adb shell "su -c 'dd if=/dev/block/mmcblk2 bs=512 count=5611520 2>/dev/null \
  | dd bs=512 skip=5349376 count=262144 2>/dev/null | sha256sum'"
```

### Gotcha: partition-device reads are unreliable

Reads of `/dev/block/by-name/*` do not agree with the whole-disk device on this unit:

- `dd if=/dev/block/by-name/oem bs=1M` returns **0 bytes**.
- `dd if=/dev/block/by-name/oem bs=512 count=262144` returns the correct length (134,217,728 bytes)
  but a different SHA-256 (`eaf0363d…`) than the whole-disk read at the same offset (`e9455277…`),
  even though their first 8 sectors are identical. The by-name result was stable across two reads.
- `vendor` and `metadata` happened to match on both paths; `oem` did not. Why was not established.

**Verify against the whole-disk device (`/dev/block/mmcblk2`), not the partition devices.**

## Changes applied (2026-10-11)

Package state and one app install only. No partition was written, and `userdata` was not touched.

| # | Change | Command | Undo |
| --- | --- | --- | --- |
| 1 | Rockchip updater off | `pm disable android.rockchip.update.service` | `pm enable android.rockchip.update.service` |
| 2 | MXOTA updater off | `pm disable com.muxintu.app.mxota` | `pm enable com.muxintu.app.mxota` |
| 3 | Launcher3 enabled | `pm enable com.android.launcher3` | `pm disable com.android.launcher3` |
| 4 | Olauncher 6.9.17 installed | `adb install app.olauncher_113.apk` | `adb uninstall app.olauncher` |
| 5 | Olauncher set as home | `cmd package set-home-activity app.olauncher/app.olauncher.MainActivity` | `cmd package set-home-activity net.frameo.frame/net.frameo.frame.ui.activities.AWaitForDeferredInitCompleted` (re-enable Frameo first) |
| 6 | Frameo app off | `pm disable net.frameo.frame` | `pm enable net.frameo.frame` |
| 7 | Factory test app off | `pm disable com.szclink.app.cldevicetest` | `pm enable com.szclink.app.cldevicetest` |
| 8 | Lightning 5.1.0 installed (WebView test) | `adb install acr.browser.lightning_101.apk` | `adb uninstall acr.browser.lightning` |
| 9 | Kiosk app installed | `adb install -r dashboard/kiosk/build/homehq.apk` | `adb uninstall com.wesbos.homehq` |
| 10 | Kiosk app set as home | `cmd package set-home-activity com.wesbos.homehq/com.wesbos.homehq.MainActivity` | `cmd package set-home-activity app.olauncher/app.olauncher.MainActivity` |

Olauncher is left installed as a fallback home app. With Frameo disabled, the only home-capable
activities are the kiosk app, Olauncher, and `com.android.settings.FallbackHome`.

Both updaters were `enabled=0` before and are `enabled=2` after. Disable them **before** the frame
reaches the internet; see [app-updates.md](app-updates.md) for why vendor update paths matter.

Frameo itself is left installed and enabled. It is still reachable with:

```sh
adb shell am start -n net.frameo.frame/net.frameo.frame.ui.activities.AWaitForDeferredInitCompleted
```

### Stock Android Settings and launcher

Both work without any modification, with Frameo still the home app:

```sh
adb shell am start -a android.settings.SETTINGS          # stock Settings
adb shell am start -n com.android.launcher3/.Launcher     # stock AOSP Launcher3
```

### Gotcha: Launcher3 ships with its HOME category stripped

`com.android.launcher3` (version 8.1.0, `/system/priv-app/Launcher3/Launcher3.apk`, 742,478 bytes) is
present but was shipped `enabled=2`. Enabling it is not enough to make it the home app: the vendor
removed `android.intent.category.HOME` from its manifest. Its only MAIN activity declares

```
com.android.launcher3/.Launcher
  Action:   "android.intent.action.MAIN"
  Category: "android.intent.category.DEFAULT"
```

With no HOME category, `cmd package set-home-activity` cannot target it and Android never offers it
in the home chooser. Before installing a third-party launcher, only
`net.frameo.frame/.ui.activities.AWaitForDeferredInitCompleted` and
`com.android.settings.FallbackHome` resolved HOME. Launcher3 still runs when started explicitly by
component, it just cannot be the default. A third-party launcher is therefore required.

After `set-home-activity`, the first Home press still showed
`android/com.android.internal.app.ResolverActivity`; pick the launcher and tap **Always** on the
frame, same as the BIUFRAME.

### This framework is stripped: two services are missing

**Most third-party launchers crash on this frame.** The vendor's framework omits services that
launchers assume exist. Test any launcher by component (`am start -n <pkg>/<activity>`) and check
`adb shell logcat -b crash -d` **before** running `set-home-activity`, or a crashing home app leaves
the frame in a dialog loop.

| Missing | Evidence |
| --- | --- |
| Wallpaper service | `service list \| grep wallpaper` is empty; `dumpsys wallpaper` says `Can't find service: wallpaper` |
| Contacts provider | `Failed to find provider com.android.contacts for user 0` |

Launchers tested, all pinned from f-droid.org:

| Launcher | Version | Result |
| --- | --- | --- |
| Rootless Pixel Launcher (`amirz.rootless.nexuslauncher`) | 3.9.1 (30911) | **crashes**, no wallpaper service |
| KISS Launcher (`fr.neamar.kiss`) | 3.26.0 (224) | **crashes**, no contacts provider |
| Fossify Launcher (`org.fossify.home`) | 1.10.0 (16) | **crashes**, no wallpaper service |
| Stock `com.android.launcher3` | 8.1.0 (system) | **crashes**, no wallpaper service |
| **Olauncher (`app.olauncher`)** | **6.9.17 (113)** | **runs, but portrait-only — see below** |

The wallpaper NPE hits four of five launchers tried, including the vendor's own Launcher3. Expect any
launcher with a wallpaper feature to fail. Olauncher is the only one found to run, and it has its own
problem (orientation, below).

Rootless Pixel Launcher is the one pinned in
[`scripts/biuframe-setup.sh`](../scripts/biuframe-setup.sh) for the BIUFRAME. Its SHA-256
`7fa44d56…38404a` still matches, but it cannot run here. It dies in `onCreate`:

```
java.lang.NullPointerException: Attempt to invoke interface method
'void android.app.IWallpaperManager.registerWallpaperColorsCallback(...)' on a null object reference
    at com.android.launcher3.dynamicui.WallpaperColorInfo.<init>
    at com.android.launcher3.Launcher.onCreate
    at com.google.android.apps.nexuslauncher.NexusLauncherActivity.onCreate
```

Anything derived from Launcher3's `dynamicui` (Rootless Pixel, Lawnchair, Pixel Launcher) should be
expected to fail the same way — **including the vendor's own `/system/priv-app/Launcher3`**, which
crashes at `Launcher.java:376` with the same stack. `am start -n com.android.launcher3/.Launcher`
briefly reports the activity as `mResumedActivity` before it dies, so **always check
`logcat -b crash -d`; a momentary resumed state is not proof a launcher works.**

This also rules out the home-shim idea below: a shim pointing at Launcher3 would crash-loop.

KISS dies differently, in a service rather than the activity:

```
java.lang.RuntimeException: Unable to create service fr.neamar.kiss.dataprovider.ContactsProvider:
java.lang.SecurityException: Failed to find provider com.android.contacts for user 0
```

Olauncher 6.9.17 (`versionCode=113`, minSdk 24, targetSdk 36) starts clean, stays resumed, and
survives `KEYCODE_HOME` with nothing in the crash buffer. Downloaded from
`https://f-droid.org/repo/app.olauncher_113.apk`, SHA-256
`a8333a2f4cc8bf1a001d9a4384b1ea9ff59b84fcf641027fa8b034707115e44c` (recorded from this download;
not cross-checked against the F-Droid index).

### Olauncher forces the display into portrait

Olauncher runs, but it is a phone launcher and declares itself portrait-only, so the window manager
rotates the whole panel 270° to satisfy it. On this 1920x1080 landscape frame the result is a
sideways home screen with the clock and app list bunched at one edge:

```
mCurrentRotation=3
mGlobalConfiguration={... sw1016dp w1016dp h1807dp 170dpi xlrg long port
                       appBounds=Rect(0, 0 - 1080, 1920)}
Olauncher Requested w=1080 h=1920
```

Locking rotation does not help: an activity's `screenOrientation` overrides `user_rotation` and
`accelerometer_rotation` (which were `0` and `1` here). Android 8.1 has no per-app orientation
override. Fixing it means repackaging Olauncher's manifest (`portrait` -> `sensorLandscape`) and
re-signing, which needs a JDK and apktool, or using a different home app.

For reference the frame reports `sw1016dp`, `xlrg`, `land`, `appBounds=Rect(0, 0 - 1920, 1080)` when
nothing is forcing portrait.

### The fix: the kiosk app is the home app (done 2026-10-12)

[`dashboard/kiosk/`](../dashboard/kiosk) solves both problems by construction, and is now what the
frame boots into:

- It is a plain WebView activity and never touches `WallpaperManager`, so the NPE cannot occur.
- It already declared `android:screenOrientation="sensorLandscape"` and
  `Theme.NoTitleBar.Fullscreen`, so the panel stays in landscape.
- It builds without Gradle at `--min-sdk-version 23`, which covers Android 8.1.

A ~20-line home shim launching another launcher was considered and dropped: Launcher3 crashes, and
Olauncher is portrait.

Three changes were needed in `dashboard/kiosk/`:

1. **`AndroidManifest.xml`** — added `android.intent.category.HOME` to the `MAIN` intent-filter
   (`LAUNCHER` and `DEFAULT` were already there; keeping `LAUNCHER` leaves it in the app drawer).
2. **`MainActivity.java`** — `DEFAULT_URL` changed to this deployment's Worker URL.
3. **`MainActivity.java`** — retry-on-error and an explicit initial scale, both described below.

Then:

```sh
adb install -r dashboard/kiosk/build/homehq.apk
adb shell "su -c 'cmd package set-home-activity com.wesbos.homehq/com.wesbos.homehq.MainActivity'"
```

### Toolchain: use the openjdk formula, not the temurin cask

`brew install --cask temurin@17` **fails non-interactively**: it runs a `.pkg` installer through
`sudo`, and sudo cannot prompt for a password without a terminal
(`sudo: a terminal is required to read the password`). The Homebrew *formula* installs into the
Homebrew prefix with no sudo at all:

```sh
brew install openjdk@17
brew install --cask android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$JAVA_HOME/bin:$PATH"
yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses
sdkmanager --sdk_root="$ANDROID_HOME" "build-tools;34.0.0" "platforms;android-34"
cd dashboard/kiosk && ./build.sh
```

`build.sh` defaults `ANDROID_HOME` to the Homebrew path already, but needs `javac` and `keytool` on
`PATH`. The built APK is about 12.8 KB.

### Gotcha: `set-home-activity` needs time to reach disk before a reboot

Setting the home activity and rebooting a few seconds later **loses the setting** — the frame came
back up on the previous launcher. PackageManager writes
`/data/system/users/0/package-restrictions.xml` lazily. Wait ~20-30 s (and optionally `sync`) and
confirm the file's mtime has changed before rebooting:

```sh
adb shell "su -c 'ls -l /data/system/users/0/package-restrictions.xml'"
```

Note that grepping `/data/system/packages.xml` for the package name is **not** a valid check: every
installed package appears there regardless of the home preference.

Uninstalling any home-capable app also clears the preference; re-run `set-home-activity` after.

### Gotcha: as the home app it starts before Wi-Fi, and the first load always fails

The kiosk is launched about 8 s into boot, well before Wi-Fi associates, so the first load fails
with `net::ERR_NAME_NOT_RESOLVED` (WebView error `-2`). The stock `new WebViewClient()` has no error
handling, so the frame would sit on the WebView error page indefinitely after any power cut.

`MainActivity` now retries the main-frame URL every 5 s until it loads, cancelling the retry on a
genuine `onPageFinished` (which also fires for the error page, hence the `loadFailed` flag).
Verified two ways: cycling Wi-Fi off and on with `svc wifi disable` / `svc wifi enable` while
watching `logcat`, and a cold boot with no interaction at all — one logged failure, then the
dashboard appeared on its own.

### Gotcha: `initial-scale=1` overflows this panel by ~120px

`dashboard/index.html` declares `<meta name="viewport" content="width=1920, initial-scale=1">`.
With `initial-scale=1`, 1 CSS px = 1 **dp**, so the page lays out 1920dp wide. This panel is 1920
**px** at 170dpi, which is only 1807dp, so the right ~113dp (~120px) is cut off.

`setLoadWithOverviewMode(true)` does **not** fix it: a page's own `initial-scale` takes precedence.
The scale has to be set explicitly:

```java
web.setInitialScale((int) Math.round(100 / getResources().getDisplayMetrics().density));
```

Density here is 1.0625, giving 94%, which lands 1920 CSS px on exactly 1920 physical px. On a
160dpi device this evaluates to 100 and changes nothing, so it is safe for the other frames.

## Reboot verification (2026-10-11)

`adb reboot`, then everything re-checked. All changes persisted:

| Check | Result |
| --- | --- |
| ADB after reboot | `device` (not `unauthorized`); reconnected on its own in about 7 s |
| `persist.sys.usb.config` | `adb` |
| Home resolver | `app.olauncher` |
| Foreground after boot | `app.olauncher/.MainActivity` — booted straight to the launcher, no chooser |
| Both updaters | `enabled=2` |
| Root | `su -c id` returns `uid=0(root)` |

So the authorization key and the USB config both survive a reboot, and the 150 ms enumeration
problem does not come back once Beta Program is enabled.

One pre-existing-looking crash appears in `logcat -b crash` on every boot:

```
F libc : Fatal signal 11 (SIGSEGV), code 1, fault addr 0x1c0 in tid 749 (supolicy), pid 749 (supolicy)
```

`supolicy` is SuperSU's SELinux policy tool, part of the stock rooted firmware; SuperSU was not
installed by us. It is inconsequential here because SELinux is already permissive, and `su` still
works. No pre-change boot log was captured, so this is not proven to predate the changes above,
but nothing applied here touches SuperSU.

Device clock note: log timestamps read `12-31 11:xx` because the frame has no set time until it
reaches a network.

## Dashboard verified on the stock WebView (2026-10-11)

**No WebView work is needed on this frame.** It ships
`com.android.webview` **106.0.5249.126** (`/system/app/webview/webview.apk`, 206,457,902 bytes),
which is exactly what `dashboard/vite.config.js` targets (`target: 'chrome106'`). None of the
BIUFRAME's WebView steps apply: no APK swap, no `lib/arm/*.so` extraction, no Let's Encrypt roots.

Verified by installing Lightning 5.1.0 (`acr.browser.lightning`, versionCode 101), which renders
with the *system* WebView rather than its own engine, and loading the live dashboard. Pinned in
[`scripts/biuframe-setup.sh`](../scripts/biuframe-setup.sh), SHA-256
`820f4f9977a20b060b4091db2b35cff8cd360e060f94aa742255c845747a2d7f`, which this download matched.

```sh
adb install acr.browser.lightning_101.apk
adb shell am start -a android.intent.action.VIEW \
  -d 'https://home-dashboard.aj-morris.workers.dev/' -n acr.browser.lightning/.MainActivity
adb exec-out screencap -p > frame.png     # no `su`, so no PTY corruption
```

Result: the dashboard rendered correctly at 1920x1080 landscape with live data (weather from
Open-Meteo, calendar, chores, shopping, the photo panel). No crash, no TLS or certificate errors,
no `net::ERR` in logcat. Lightning does not force portrait, which confirms the sideways home screen
is Olauncher's doing and not a device setting.

`adb exec-out screencap -p` is a reliable way to see the frame's screen, and unlike the `dd` case it
needs no `su`, so it is not affected by the PTY corruption described above.

## Stopping the vendor software from phoning home

Done before the frame was ever given Wi-Fi. Only four non-AOSP packages exist, and all four hold
`android.permission.INTERNET`:

| Package | What it is | State |
| --- | --- | --- |
| `net.frameo.frame` | the Frameo vendor app | `enabled=2` |
| `com.muxintu.app.mxota` | third-party OTA updater | `enabled=2` |
| `android.rockchip.update.service` | Rockchip update service | `enabled=2` |
| `com.szclink.app.cldevicetest` | factory test app, also holds INTERNET | `enabled=2` |

```sh
adb shell "su -c 'pm disable net.frameo.frame'"
adb shell "su -c 'pm disable com.szclink.app.cldevicetest'"
adb shell "su -c 'pm disable android.rockchip.update.service'"
adb shell "su -c 'pm disable com.muxintu.app.mxota'"
```

Verified afterwards: no Frameo process in `ps -A`, and `dumpsys activity services` matches zero
Frameo entries. Undo is `pm enable <pkg>` for each.

Find every candidate on another unit with:

```sh
adb shell pm list packages | grep -viE '^package:(com\.android\.|android$|android\.)'
```

**Disabling Frameo removes the fallback home app.** After this, the only home-capable activities are
the installed launcher and `com.android.settings.FallbackHome`. That is still recoverable over ADB,
but do not disable Frameo until a working launcher is set as home.

## Security notes for the owner

- **Any app can get root without a prompt.** `su` is present and returns uid 0 with no manager app
  gating it, same as the BIUFRAME. Install nothing you do not trust.
- **SELinux is permissive**, and `androidboot.veritymode=enforcing` is set but SELinux is not.
- The build is from May 2026 but is Android 8.1 (2017), so it is years past its security support.
- Two vendor updaters shipped enabled: `android.rockchip.update.service` and `com.muxintu.app.mxota`
  (`muxintu` is an unidentified third party). Both are now disabled.
- Keep the frame on a guest or IoT network, and do not sign in to a primary Google, Apple or bank
  account on it.
- A network with no route to the internet lets the Frameo onboarding proceed while preventing an
  updater from reaching a server. See [app-updates.md](app-updates.md).

## Open items

- Frameo onboarding would not persist until it was completed: every reboot returned to the Welcome
  screen. It completed later in the session; whether Wi-Fi association was required was not
  established.
- A "retail mode" option is offered in the bottom-left corner of the Welcome screen. Not tried.
- Reset pinhole and Rockchip loader mode entry were not identified on this unit, so there is no
  tested restore path for the backup yet. `rkdeveloptool` plus loader mode is the presumed route;
  see [research-log.md](research-log.md).
- `userdata` is not backed up.
- The `by-name` versus whole-disk read discrepancy on `oem` is unexplained.
- ~~Not yet verified across a reboot.~~ **Verified 2026-10-11** (see below).
- The Frameo app remains installed and enabled, and is reachable by component. It was not disabled,
  so it may still start services at boot. `pm disable net.frameo.frame` was not tried; it is a
  priv-app and is the fallback home if Olauncher is ever removed.
- Only Olauncher was found to run at all, and it forces portrait. No landscape-capable launcher that
  avoids `WallpaperManager` has been found. The kiosk app is the home screen instead; Olauncher
  stays installed only as a fallback.
- The dashboard's "Enjoy the quiet." line is clipped at the descender inside its black card at this
  scale. That is the web app's own CSS, not a frame or kiosk issue.
- The frame is on the main LAN (192.168.4.0/22), not a guest or IoT network.
- Uninstalling any home-capable app **clears the home preference**: after
  `adb uninstall org.fossify.home`, the resolver returned `packageName=android`
  (`ResolverActivity`) and `set-home-activity` had to be run again. Re-check the resolver after any
  launcher uninstall.
- Activity aliases in some launchers are not exported (Fossify uses them for themed icons), so
  `am start -n <pkg>/<alias>` fails with `Permission Denial ... not exported`. Run it through
  `su -c` instead.
