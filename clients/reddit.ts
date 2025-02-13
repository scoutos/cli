import { z } from 'https://deno.land/x/zod@v3.11.6/mod.ts'
import { bold, cyan } from 'https://deno.land/std@0.218.0/fmt/colors.ts'

// Define the schema for the function arguments
const ArgsSchema = z.object({
  subreddits: z.array(z.string()),
  interval: z.number().min(1000),
  callback: z.function().args(z.any()).returns(z.promise(z.void())),
  limit: z.number().min(1).max(100).default(5),
  sort: z.enum(['new', 'hot', 'top']).default('new'),
})

type Args = z.infer<typeof ArgsSchema>

// Helper: fetch the latest posts from a single subreddit
async function fetchNewPosts(subreddit: string, limit: number, sort: string) {
  const url =
    `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}`

  try {
    const resp = await fetch(url)
    if (!resp.ok) {
      console.error(`Failed to fetch subreddit ${subreddit}:`, resp.status)
      return []
    }
    const data = await resp.json()
    const children = data?.data?.children ?? []
    // deno-lint-ignore no-explicit-any
    return children.map((child: any) => child.data)
  } catch (error) {
    console.error(`Error fetching from ${url}:`, error)
    return []
  }
}

// Main function to monitor subreddits
export async function monitorSubreddits(args: Args) {
  // Validate the arguments
  const { subreddits, interval, callback, limit, sort } = ArgsSchema.parse(args)

const seenPostIds = new Set<string>()

  async function checkSubreddits() {
    for (const subreddit of subreddits) {
      const posts = await fetchNewPosts(subreddit, limit, sort)
      for (const post of posts) {
        if (!seenPostIds.has(post.id)) {
          seenPostIds.add(post.id)
          await callback(post)
        }
      }
    }
  }

  setInterval(async () => {
    const timestamp = new Date().toISOString()
    console.log(bold(cyan(`[${timestamp}] Checking for new Reddit posts...`)))
    await checkSubreddits()
  }, interval)

  await checkSubreddits()
}
