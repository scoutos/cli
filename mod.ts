// deno-lint-ignore-file
// @ts-ignore no-slow-types
import { Command } from 'https://deno.land/x/cliffy@v0.25.7/command/mod.ts'
import { join } from 'https://deno.land/std@0.218.0/path/mod.ts'
import { Scout, ScoutClient } from 'npm:scoutos@0.8.4'
import { parse } from 'jsr:@std/yaml'
import {
  bold,
  cyan,
  green,
  red,
  underline,
  yellow,
} from 'https://deno.land/std@0.218.0/fmt/colors.ts'
import { expandGlob, walk } from 'https://deno.land/std@0.218.0/fs/mod.ts'
import {
  fetchAndCreateTemplate,
  getTemplateById,
  listTemplates,
} from './utils/fetch_template.ts'
import { Select } from 'https://deno.land/x/cliffy@v0.25.7/prompt/mod.ts'
import { slugify } from 'https://deno.land/x/slugify/mod.ts'
import { Table } from 'https://deno.land/x/cliffy@v0.25.7/table/mod.ts'
import { monitorSubreddits } from './clients/reddit.ts'
import { z } from 'https://deno.land/x/zod@v3.11.6/mod.ts'

const BASE_URL = 'https://api-prod.scoutos.com'
// const BASE_URL = 'http://localhost:8000'
const scoutosVersion = '0.8.4'

export const config: {
  CONFIG_DIR: string
  CONFIG_FILE: string
} = {
  CONFIG_DIR: join(
    Deno.env.get('HOME') || Deno.env.get('USERPROFILE') || '.',
    '.scout',
  ),
  get CONFIG_FILE() {
    return join(this.CONFIG_DIR, 'secrets.json')
  },
}

type CommandType = Command<any, any, any, any, any, any, any, any>

async function getStoredApiKey(): Promise<string | null> {
  // First check for environment variable
  const envApiKey = Deno.env.get('SCOUT_API_KEY')
  if (envApiKey) {
    return envApiKey
  }
  // Fall back to stored key
  try {
    const configData = await Deno.readTextFile(config.CONFIG_FILE)
    return JSON.parse(configData).apiKey || null
  } catch {
    return null
  }
}

async function saveApiKey(apiKey: string | null): Promise<void> {
  try {
    await Deno.mkdir(config.CONFIG_DIR, { recursive: true })
    const configData = { apiKey }
    await Deno.writeTextFile(
      config.CONFIG_FILE,
      JSON.stringify(configData, null, 2),
    )
  } catch (error) {
    console.error('Failed to save API key:', error)
    throw error
  }
}

async function _getInputs(inputs: string): Promise<string> {
  if (inputs.startsWith('@')) {
    const filePath = inputs.slice(1)
    try {
      const fileContent = await Deno.readTextFile(filePath)
      return fileContent
    } catch (error) {
      console.error(`Failed to read inputs from file: ${filePath}`, error)
      Deno.exit(1)
    }
  }
  return inputs
}

function _highlightJson(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:\s*)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = green
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = cyan
        } else {
          cls = yellow
        }
      } else if (/true|false/.test(match)) {
        cls = red
      } else if (/null/.test(match)) {
        cls = red
      }
      return cls(match)
    },
  )
}

async function executeEphemeralWorkflow(
  inputs: string,
  apiKey: string,
  config: string,
): Promise<void> {
  try {
    console.log(bold(green('Executing workflow @')), config)
    const configData = await Deno.readTextFile(config)
    const configJson = parse(configData) as any

    let inputsJson: string
    if (inputs) {
      inputsJson = inputs.startsWith('@')
        ? await Deno.readTextFile(inputs.slice(1))
        : inputs
    } else {
      const defaultInputsPath = join(config, '..', 'inputs', 'default.json')
      inputsJson = await Deno.readTextFile(defaultInputsPath)
    }

    const client = new ScoutClient({ apiKey: apiKey, environment: BASE_URL })
    console.log(bold('Inputs JSON:'), inputsJson)

    const startTime = performance.now()
    const result: any = await client.workflows.runWithConfig({
      inputs: JSON.parse(inputsJson),
      workflow_config: configJson.workflow_config as any,
    })
    const endTime = performance.now()
    const latency = endTime - startTime

    // Check for and use _parse_output function from meta.ts if it exists
    const metaPath = join(config, '..', 'meta.ts')

    let parsedResult = result
    try {
      const metaModule = await import(metaPath)
      const { _parse_output } = metaModule.default
      if (typeof _parse_output === 'function') {
        parsedResult = _parse_output(result)
      }
    } catch (error) {
      // console.warn(yellow(`No _parse_output function found in ${metaPath}`));
    }

    console.log(bold(green('Workflow executed successfully:')))
    console.log(bold('='.repeat(50)))

    // Display metrics
    console.log(bold(cyan('Metrics:')))
    const workflowId =
      result?.run?.state?.__exp_global?.workflow?.workflow_id || 'N/A'
    const status = result?.run?.stop_reason || 'N/A'
    const workflowDisplayName =
      configJson.workflow_config.workflow_display_name || 'N/A'
    const workflowSchemaVersion =
      configJson.workflow_config.workflow_schema_version || 'N/A'
    const sessionId = result?.run?.session_id || 'N/A'
    const organizationId = result?.run?.state?.__exp_global?.organization?.id ||
      'N/A'
    new Table()
      .header([bold('Metric'), bold('Value')])
      .body([
        [bold('Latency w/ Network (ms)'), latency.toFixed(2)],
        [bold('Workflow ID'), workflowId],
        [bold('Status'), status],
        [bold('Workflow Display Name'), workflowDisplayName],
        [bold('Workflow Schema Version'), workflowSchemaVersion],
        [bold('Session ID'), sessionId],
        [bold('Organization ID'), organizationId],
      ])
      .border(true)
      .render()

    console.log(bold('='.repeat(50)))
    console.log(bold(cyan('Output:')))
    console.dir(parsedResult, { depth: null, colors: true })

    console.log(bold(green('1/1 workflows run successfully')))
  } catch (error) {
    console.error(bold(red('Failed to execute workflow:')), error)
    Deno.exit(1)
  }
}

async function executeWorkflow(
  inputs: Record<string, unknown>,
  apiKey: string,
  workflowId: string,
): Promise<void> {
  try {
    console.log(bold(green('Executing workflow with ID:')), workflowId)

    const client = new ScoutClient({ apiKey: apiKey, environment: BASE_URL })
    console.log(bold('Inputs JSON:'), JSON.stringify(inputs))

    // const startTime = performance.now()
    const result: any = await client.workflows.run(workflowId, {
      inputs,
    })
    // const endTime = performance.now()
    return result
    // const latency = endTime - startTime

    console.log(bold(green('Workflow executed successfully:')))
    console.log(bold('='.repeat(50)))

    // Display metrics
    // console.log(bold(cyan('Metrics:')))
    // const status = result?.run?.stop_reason || 'N/A'
    // const sessionId = result?.run?.session_id || 'N/A'
    // const organizationId = result?.run?.state?.__exp_global?.organization?.id ||
    //   'N/A'
    // new Table()
    //   .header([bold('Metric'), bold('Value')])
    //   .body([
    //     [bold('Latency w/ Network (ms)'), latency.toFixed(2)],
    //     [bold('Status'), status],
    //     [bold('Session ID'), sessionId],
    //     [bold('Organization ID'), organizationId],
    //   ])
    //   .border(true)
    //   .render()

    // console.log(bold('='.repeat(50)))
    // console.log(bold(cyan('Output:')))
    // console.dir(result, { depth: null, colors: true })

    // console.log(bold(green('1/1 workflows run successfully')))
  } catch (error) {
    console.error(bold(red('Failed to execute workflow:')), error)
    Deno.exit(1)
  }
}

interface WorkflowConfig {
  workflow_config: JSON
  workflow_key?: string
}

async function deployWorkflow(
  configPath: string,
  apiKey: string,
): Promise<void> {
  console.log(bold(green('Deploying workflow...')))
  const client = new ScoutClient({ apiKey: apiKey })
  const configData = await Deno.readTextFile(configPath)
  const parsedConfig = parse(configData) as WorkflowConfig
  const workflowConfig = parsedConfig.workflow_config
  const workflowKey = parsedConfig.workflow_key

  if (!parsedConfig) {
    console.error('Error: Invalid config file.')
    Deno.exit(1)
  }
  if (!workflowKey) {
    console.error('Error: Invalid workflow key.')
    Deno.exit(1)
  }

  try {
    const response: Scout.SrcHandlersCreateWorkflowRevisionResponse =
      await client.workflows.create({
        workflow_key: workflowKey,
        body: workflowConfig,
      } as Scout.WorkflowsCreateRequest)
    const workflowId = response?.data?.workflow_id
    const urlToWorkflow = `https://studio.scoutos.com/workflows/${workflowId}`
    console.log(
      bold(
        green(
          `Workflow deployed successfully. You can view the workflow at ${urlToWorkflow}`,
        ),
      ),
    )
  } catch (error: any) {
    if (error?.statusCode) {
      console.log(bold('Response status:'), error.statusCode)
    }
    if (error?.body) {
      console.log(bold('Response status text:'), error.body)
    }
    if (error.statusCode === 409) {
      console.log(bold(yellow('Workflow Exists, Creating New Revision...')))
      const response: Scout.SrcHandlersCreateWorkflowRevisionResponse =
        await client.workflows.createRevision({
          workflow_key: workflowKey,
          body: workflowConfig,
        } as Scout.WorkflowsCreateRevisionRequest)
      const workflowId = response?.data?.workflow_id
      const urlToWorkflow = `https://studio.scoutos.com/workflows/${workflowId}`
      console.log(
        bold(
          green(
            `Workflow revision created successfully. You can view the workflow at ${urlToWorkflow}`,
          ),
        ),
      )
    } else {
      console.error(bold(red('Failed to deploy workflow:')), error)
    }
    Deno.exit(1)
  }
}

async function findRootDir(): Promise<string | null> {
  let currentDir = Deno.cwd()
  while (true) {
    console.log('currentDir', currentDir)
    currentDir = `${currentDir}`
    try {
      const entries = await Deno.readDir(currentDir)
      for await (const entry of entries) {
        if (entry.isFile && entry.name === 'scout.config.ts') {
          return currentDir
        }
      }
      const parentDir = join(currentDir, '..')
      if (parentDir === currentDir) break
      currentDir = parentDir
    } catch {
      break
    }
  }
  return null
}

async function listWorkflows(rootDir: string): Promise<string[]> {
  const workflowsDir = join(rootDir, 'workflows')
  const workflowPaths: string[] = []
  for await (const entry of walk(workflowsDir, { exts: ['.yml'] })) {
    if (entry.isFile) {
      workflowPaths.push(entry.path)
    }
  }
  return workflowPaths
}

const runCommand: CommandType = new Command()
  .description('Run a workflow')
  .arguments('<workflow_folder:string>')
  .option(
    '-i, --inputs <inputs:string>',
    'JSON string of inputs for the workflow',
  )
  .action(async ({ inputs }, workflowFolder) => {
    let apiKey = await getStoredApiKey()
    if (!apiKey) {
      console.log(bold('Please enter your API key:'))
      apiKey = prompt('API Key:')
      if (!apiKey) {
        console.error(bold(red('API key is required')))
        Deno.exit(1)
      }
      await saveApiKey(apiKey)
    }

    const rootDir = await findRootDir()
    if (!rootDir) {
      console.error(bold(red('Could not find the root directory.')))
      Deno.exit(1)
    }

    const config = join(rootDir, 'workflows', workflowFolder, 'workflow.yml')

    console.log('inputs', inputs)
    console.log('apiKey', apiKey)
    console.log('config', config)
    await executeEphemeralWorkflow(inputs || '', apiKey, config)
  })

const loginCommand: CommandType = new Command()
  .description('Login to Scout')
  .action(async () => {
    console.log(bold(green('Logging in...')))
    const apiKey = prompt('API Key:')
    if (!apiKey) {
      console.error(bold(red('API key is required')))
      Deno.exit(1)
    }
    await saveApiKey(apiKey)
  })

const getCommand: CommandType = new Command()
  .description('Get a workflow')
  .arguments('<workflow_id:string>')
  .option('-o, --output <output:string>', 'Path to save the output')
  .action(async ({ output }, workflowId) => {
    let apiKey = await getStoredApiKey()
    if (!apiKey) {
      console.log(bold('Please enter your API key:'))
      apiKey = prompt('API Key:')
      if (!apiKey) {
        console.error(bold(red('API key is required')))
        Deno.exit(1)
      }
      await saveApiKey(apiKey)
    }
    console.log('Output and workflowId', output, workflowId)
    // TODO: Implement getWorkflow (where does it go? saved as yaml file locally?)
    // await getWorkflow(workflowId, apiKey, output);
  })

const deployCommand: CommandType = new Command()
  .description('Deploy a workflow')
  .arguments('<workflow_folder:string>')
  .action(async (_data, workflowFolder: string) => {
    let apiKey = await getStoredApiKey()
    if (!apiKey) {
      console.log(bold('Please enter your API key:'))
      apiKey = prompt('API Key:')
      if (!apiKey) {
        console.error(bold(red('API key is required')))
        Deno.exit(1)
      }
      await saveApiKey(apiKey)
    }

    const rootDir = await findRootDir()
    if (!rootDir) {
      console.error(bold(red('Could not find the root directory.')))
      Deno.exit(1)
    }

    const config = join(rootDir, 'workflows', workflowFolder, 'workflow.yml')

    await deployWorkflow(config, apiKey)
  })

async function scaffoldProject(projectName: string) {
  const slugifiedProjectName = slugify(projectName).toLowerCase()
  const projectPath = join(Deno.cwd(), slugifiedProjectName)

  // Check if the directory already exists
  try {
    const stat = await Deno.stat(projectPath)
    if (stat.isDirectory) {
      console.error(
        bold(red(`Error: Directory '${projectPath}' already exists.`)),
      )
      Deno.exit(1)
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      if (error instanceof Error) {
        console.error(bold(red(`Error checking directory: ${error.message}`)))
      } else {
        console.error(bold(red(`Error checking directory: ${String(error)}`)))
      }
      Deno.exit(1)
    }
  }

  const bootstrap = confirm(
    'Would you like to bootstrap your project with a workflow from a template?',
  )
  const DEFAULT_TEMPLATE_ID = 'aWbHA3HU3CIWQq7NNjEFPT'

  let selectedTemplateId = DEFAULT_TEMPLATE_ID

  if (bootstrap) {
    const templates = await listTemplates()
    const templateChoices = templates.map((t: any) => ({
      name: bold(t.name),
      value: t.id,
    }))

    const formattedTemplateChoices = templateChoices.map(
      (choice: any, index: number) => ({
        name: `${index + 1}. ${choice.name}`,
        value: choice.value,
      }),
    )

    // filter to only show default template
    const filteredTemplateChoices = formattedTemplateChoices.filter(
      (choice: any) => choice.value === DEFAULT_TEMPLATE_ID,
    )

    selectedTemplateId = await Select.prompt({
      message: 'Select a template to bootstrap your project with:',
      options: filteredTemplateChoices,
    })
  }

  const template = await getTemplateById(selectedTemplateId)
  const slugifiedTemplateName = slugify(template.name).toLowerCase()
  const workflowPath = join(projectPath, 'workflows', slugifiedTemplateName)

  // Create the project directory after the last step
  await Deno.mkdir(workflowPath, { recursive: true })
  await Deno.writeTextFile(
    join(workflowPath, 'workflow.yml'),
    template.yamlContent, // Ensure YAML content is written
  )

  // Create meta.ts file in the workflow folder
  await Deno.writeTextFile(
    join(workflowPath, 'meta.ts'),
    `export default {
      // deno-lint-ignore no-explicit-any
      _parse_output: (workflowRunResponse: Record<string, any>) => {
        return workflowRunResponse;
      },
    };`,
  )

  const defaultInputs: { [key: string]: { user_message: string } } = {
    [DEFAULT_TEMPLATE_ID]: {
      user_message: 'Hi!',
    },
  }

  const inputValues = defaultInputs[selectedTemplateId] || {}

  // Create "inputs" folder and write default.json
  const inputsPath = join(workflowPath, 'inputs')
  await Deno.mkdir(inputsPath, { recursive: true })
  await Deno.writeTextFile(
    join(inputsPath, 'default.json'),
    JSON.stringify(inputValues),
  )

  // Create scout.config.js file in the root of the project
  await Deno.writeTextFile(
    join(projectPath, 'scout.config.ts'),
    'export default {};',
  )

  console.log(
    bold(
      green(`Project '${slugifiedProjectName}' has been created successfully.`),
    ),
  )

  return { slugifiedProjectName, slugifiedTemplateName }
}

const initCommand: CommandType = new Command()
  .description('Initialize a new project with optional templates')
  .action(async () => {
    const projectName = prompt('Enter the name of your new project:')
    if (!projectName || /[<>:"/\\|?*\x00-\x1F]/.test(projectName)) {
      console.error(
        bold(red('Invalid project name. Please avoid special characters.')),
      )
      Deno.exit(1)
    }
    try {
      const { slugifiedTemplateName, slugifiedProjectName } =
        await scaffoldProject(projectName)

      console.log(bold(cyan(`\nNext steps:`)))
      console.log(
        bold(
          `  1. ${
            cyan(`cd ${slugifiedProjectName}`)
          } - Navigate to your new project directory`,
        ),
      )
      console.log(
        bold(
          `  2. ${
            cyan(`scout workflows run ${slugifiedTemplateName}`)
          } - Run the workflow to see it in action`,
        ),
      )
      console.log(
        bold(
          `  3. ${
            cyan(`scout workflows deploy ${slugifiedTemplateName}`)
          } - Deploy the workflow to Scout`,
        ),
      )
      console.log(bold(`\nHappy scouting! 🚀`))
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : 'An unknown error occurred.'
      console.error(red(`Error: ${errorMessage}`))
      Deno.exit(1)
    }
  })

const linkCommand: CommandType = new Command()
  .description('Link your API key')
  .action(async () => {
    const hasAccount = await Select.prompt({
      message: 'Do you have a Scout account?',
      options: [
        { name: 'Yes', value: 'yes' },
        { name: 'No', value: 'no' },
      ],
    })

    if (hasAccount === 'no') {
      console.log(bold('Opening sign-up page...'))
      // @ts-ignore
      await Deno.run({
        cmd: ['open', 'https://studio.scoutos.com/onboarding/step-1'],
      }).status()
      console.log(bold('Please sign up and then run this command again.'))
      Deno.exit(0)
    }

    console.log(
      bold(
        'Please visit https://studio.scoutos.com/settings/api-keys to find your API key.',
      ),
    )
    const apiKey = prompt('API Key:')
    if (!apiKey) {
      console.error(bold(red('API key is required')))
      Deno.exit(1)
    }
    await saveApiKey(apiKey)
    console.log(bold(green('API key saved successfully')))
  })

const workflowsCommand: CommandType = new Command()
  .description('Manage workflows')
  .command('run', runCommand)
  .command('deploy', deployCommand)
  .command('get', getCommand)

const ArgsSchema = z.object({
  subreddits: z.array(z.string()),
  interval: z.number().min(1000),
  callback: z.function().args(z.any()).returns(z.promise(z.void())),
  limit: z.number().min(1).max(100).default(5),
  sort: z.enum(['new', 'hot', 'top']).default('new'),
})

const listenCommand: CommandType = new Command()
  .description('Listen to subreddits')
  .option(
    '-s, --subreddits <subreddits:string>',
    'Comma-separated list of subreddits to monitor',
  )
  .option(
    '-i, --interval <interval:number>',
    'Interval in seconds to check the subreddits',
    { default: 30000 },
  )
  .option(
    '-l, --limit <limit:number>',
    'Number of posts to fetch per subreddit',
    { default: 20 },
  )
  .option('--sort <sort:string>', 'Sort order of posts (new, hot, top)', {
    default: 'new',
  })
  .option(
    '--workflow_id <workflow_id:string>',
    'ID of the workflow to execute for each post',
  )
  // @ts-ignore
  .action(async ({ subreddits, interval, limit, sort, workflow_id }) => {
    let apiKey = await getStoredApiKey()
    if (!apiKey) {
      console.log(
        bold(
          red(
            'API key is required. Please link your Scout account by running `scout link`',
          ),
        ),
      )
      Deno.exit(1)
    }

    if (!subreddits) {
      console.error(bold(red('Subreddits are required')))
      Deno.exit(1)
    }
    if (!workflow_id) {
      console.error(bold(red('Workflow ID is required')))
      Deno.exit(1)
    }

    const subredditList = subreddits.split(',').map((s: string) => s.trim())
    const args = ArgsSchema.parse({
      subreddits: subredditList,
      interval,
      limit,
      sort,
      callback: async (post) => {
        console.log(
          `New post in ${post.subreddit}: ${post.title} by ${post.author}`,
        )
        try {
          await executeWorkflow({ post }, apiKey, workflow_id)
        } catch (error) {
          console.error(
            bold(red(`Failed to execute workflow for post: ${post.title}`)),
            error,
          )
        }
      },
    })
    await monitorSubreddits(args)
  })

const redditCommand: CommandType = new Command()
  .description('Manage Reddit interactions')
  .command('listen', listenCommand)

export const scoutCli: CommandType = new Command()
  .name('scout')
  .version(scoutosVersion)
  .description('Scout CLI tool')
  .command(
    'version',
    new Command().description('Show version information').action(() => {
      console.log(`scout-cli version: ${scoutCli.getVersion()}`)
      console.log(`scoutos version: ${scoutosVersion}`)
    }),
  )
  .command('workflows', workflowsCommand)
  .command('login', loginCommand)
  .command('init', initCommand)
  .command('link', linkCommand)
  .command('reddit', redditCommand)

if (import.meta.main) {
  await scoutCli.parse(Deno.args)
}
