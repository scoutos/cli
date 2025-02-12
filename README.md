# scout-cli

`scout-cli` allows one to interact with and update Scout workflows via
[CLI](https://en.wikipedia.org/wiki/Command-line_interface) commands.

## Table of Contents

- [Getting Started](#getting-started)
  - [Setup](#setup)
    - [macOS](#macos)
    - [Linux](#linux)
    - [Windows](#windows)
  - [Connect to Your Scout Account](#connect-to-your-scout-account)
  - [Initialize a Scout Project](#initialize-a-scout-project)
  - [Run a Workflow](#run-a-workflow)
  - [Deploy a Workflow](#deploy-a-workflow)
- [AI Workflow Project Structure](#ai-workflow-project-structure)
- [Local Development](#local-development)

## Getting Started

### Setup

#### macOS

1. If you don't have Homebrew installed, install it from [Homebrew](https://brew.sh/):

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. Run the following commands to download and install the ScoutOS CLI:

```sh
brew tap scoutos/scoutos-cli
brew install scoutos-cli
```

3. Now you should be able to use `scout` from your system! Try running `scout --help` to see if it works.

#### Linux

1. If you don't have Homebrew installed, install it from [Homebrew](https://brew.sh/):

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. Run the following commands to download and install the ScoutOS CLI:

```sh
brew tap scoutos/scoutos-cli
brew install scoutos-cli
```

3. Now you should be able to use `scout` from your system! Try running `scout --help` to see if it works.

#### Windows

1. Download the Windows executable from the [Latest Release](https://github.com/scoutos/scout-cli/releases/tag/latest/scout-cli-windows.exe).

2. Move and authorize the downloaded file:

```sh
# Move & rename executable
move scout-cli.exe C:\Windows\System32\scout.exe
```

3. Now you should be able to use `scout` from your system! Try running `scout --help` to see if it works.

4. If you want to remove the CLI, you can run:

```sh
del C:\Windows\System32\scout.exe
```

5. **Note**: You may have to grant the CLI permissions to write, read, and delete on your system.
   - `icacls C:\Windows\System32\scout.exe /grant Everyone:F`

### Connect to Your Scout Account

Authenticate your local environment with:

```sh
scout link
```

This will securely connect your CLI to your **Scout account**.

### Initialize a Scout Project

To start a new Scout project in your local directory, run:

```sh
scout init
```

The CLI will walk you through the setup process.

### Run a Workflow

To run a specific workflow, use the following command:

```sh
scout workflows run <workflow_folder>
```

Replace `<workflow_folder>` with the folder name of the workflow you want to run

### Deploy a Workflow

To deploy a workflow, use the following command:

```sh
scout workflows deploy <workflow_folder>
```

---

## 📁 AI Workflow Project Structure

A **Scout AI Workflows as Code** project follows a structured hierarchy:

```
/workflows
├── workflow_1/
│   ├── workflow.yml
│   ├── inputs/
│   │   ├── default.json
│   ├── meta.ts
│
├── workflow_2/
│   ├── workflow.yml
│   ├── inputs/
│   │   ├── default.json
│   ├── meta.ts
│
└── scout.config.ts
```

### **🔹 Key Components:**

- **`workflow.yml`** – Defines each AI workflow.
- **`inputs/default.json`** – Stores default input parameters for the workflow.
- **`meta.ts`** – Metadata and additional configuration for the workflow.
- **`scout.config.js`** – Configuration settings for your Scout project.

## Local Development

1. Clone and setup:

```bash
git clone git@github.com:scoutos/scout-cli.git
cd scout-cli
```

2. Install prerequisites:

- [Install Deno](https://docs.deno.com/runtime/getting_started/installation/)
- [Setup your development IDE environment](https://docs.deno.com/runtime/getting_started/setup_your_environment/)

3. Now you should be able to run the code locally:

```bash
deno task dev --help
```

```bash
deno task dev workflows deploy --config ./examples/starter/workflows/source_mapping.yml
```

3. Now you should be able to use `scout` from your system! Trying running `scout --help` to see if it works.
4. If you want to remove the cli you can run `sudo rm /usr/local/bin/scout`.
5. **Note**: You may have to grant the cli permissions to write, read, delete to your system.
