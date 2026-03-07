# Desktop Pet

A desktop companion app that lives on top of all your other windows. Earn coins by typing, unlock new pets, run Pomodoro timers, launch apps, and more — all from a small radial pie menu.

Built with Electron + React.

---

## Pets

| Name | Unlocked by default |
|------|-------------------|
| Squid | Yes |
| Knight | Yes |
| Dragon | 300 coins |
| Panda | 300 coins |

---

## Download

Download the latest release for your platform from the [Releases](../../releases) page.

| Platform | File |
|----------|------|
| macOS | `.zip` |
| Windows | `.exe` (Squirrel installer) |
| Linux | `.deb` or `.rpm` |

---

## Installation

### macOS

1. Download the `.zip`, open it, and drag **Desktop Pet** to your Applications folder.
2. The first time you open it, macOS will block it because the app is not notarized:
   - **Right-click** the app → **Open** → click **Open** in the dialog.
   - You only need to do this once.

**Granting Accessibility permission (required for keystroke counting and coins)**

The app uses system-wide keystroke counting to award coins. macOS requires explicit Accessibility permission for this.

When you first open Settings, a banner will prompt you. Click **Open System Settings** and follow these steps:

1. Go to **System Settings → Privacy & Security → Accessibility**
2. Find **Desktop Pet** in the list and toggle it **on**
3. If prompted, enter your password

If you dismissed the banner and want to grant permission manually:
> **System Settings** → **Privacy & Security** → **Accessibility** → enable **Desktop Pet**

Without this permission the app still runs, but keystroke counting and coin rewards will not work.

---

### Windows

1. Run the `.exe` installer. Windows SmartScreen may show a warning because the app is not code-signed.
2. Click **More info** → **Run anyway**.

---

### Linux

Install the `.deb` (Debian/Ubuntu) or `.rpm` (Fedora/RHEL) package using your package manager:

```bash
# Debian/Ubuntu
sudo dpkg -i desktop-pet-*.deb

# Fedora/RHEL
sudo rpm -i desktop-pet-*.rpm
```

---

## How to Use

### Moving the pet

Click and drag the pet anywhere on your screen. It will remember its position between sessions.

### Opening Settings

- **Left-click** the pet to trigger its happy animation, then Settings opens automatically.
- **Right-click** the pet to open Settings directly.
- Use the **Close app** button in Settings to quit (the pet plays a goodbye animation).

### Pie menu

Hover near the pet to reveal the radial pie menu. You can add up to 8 items per profile:

| Type | What it does |
|------|-------------|
| **Pomodoro timer** | 25 min focus → short break → long break cycle |
| **Timer** | Custom countdown (any duration) |
| **Link** | Opens a URL in your browser |
| **Application** | Launches an app on your computer |
| **System Volume** | Opens your OS sound/volume settings |

**Timer controls:**
- Click a running timer to **pause/resume** it.
- When a timer finishes, the pie section flashes. Click **▶** to start the next phase or **⏹** to stop.
- Paused timers keep their remaining time if you close and reopen the app.

### Coins and the Shop

You earn coins automatically:

| Action | Reward |
|--------|--------|
| Every 1,000 keystrokes | +10 coins |
| 10,000 keystrokes in a day | +75 coins |
| Daily streak (any activity) | +25 coins |
| Completing a Pomodoro | +50 coins |
| First Pomodoro of the day | +15 coins |
| 5-Pomodoro day | +50 coins |

Open the **Shop** tab in Settings to see your balance and unlock new pets (Dragon and Panda cost 300 coins each).

### Profiles and schedules

Go to **Settings → Settings tab** to create multiple profiles. Each profile can have:

- Its own **pet type** and **animation style** per state
- Its own **pie menu** items
- An optional **time range** (e.g. active 09:00–17:00)
- Optional **days of week** (e.g. weekdays only)

The first profile whose schedule matches the current time and day is used automatically. A profile with no time set is the default fallback.

### Pet states

The pet reacts to what you're doing:

| State | Trigger | Default animation |
|-------|---------|-----------------|
| Idle | Just sitting there | Idle loop + occasional walk (Squid) |
| Curious | Mouse hovering over it | Waves / looks around |
| Happy | You clicked it | Excited animation |
| Sleepy | No mouse/keyboard activity for 10 minutes | Falls asleep |
| Dragging | Being dragged | Running/falling |

All animations are configurable per-profile in Settings.

---

## Building from Source

Requires [Node.js](https://nodejs.org) 18+.

```bash
git clone https://github.com/sarafritz/desktop-pet.git
cd desktop-pet
npm install
npm start          # run in development
npm run make       # build installers (output in out/make/)
```

> **macOS note:** building the macOS `.zip` requires running `npm run make` on a Mac.

---

## License

MIT — see `package.json`.

Sprite assets (Knight, Dragon, Panda) are used under the [Penzilla Design Standard License](assets/PenzillaDesign_StandardLicense.pdf).
