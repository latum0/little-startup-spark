# Little Startup Spark

its an mvp app, so dont overengineer it

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/804b4435-5594-448d-b67c-3f7cfefcb5c8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Install the desktop app

NEXUS is an Electron desktop app. To create an installer for your computer, install the dependencies and run the build command for your operating system:

```sh
npm install
npm run desktop:build:win    # Windows installer (.exe)
npm run desktop:build:mac    # macOS disk image (.dmg)
npm run desktop:build:linux  # Linux AppImage
```

Run only the command for the platform you want to package. The installer is written to `dist/`. On Windows, open the generated NEXUS setup `.exe` and follow the installer; it lets you choose an installation folder and creates Start Menu shortcuts. For local desktop development, use `npm run desktop:dev`.
