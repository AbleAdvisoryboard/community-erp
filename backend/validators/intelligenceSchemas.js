import { z } from 'zod';

export const upsertOrgInsight = z.object({
  body: z.object({
    account_id: z.number().int(),
    rating: z.enum(['Strong','Stable','AtRisk','NeedsSupport']).optional(),
    status: z.enum(['Active','Dormant','Competitor']).optional(),
    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
    last_reviewed_at: z.string().optional(),
    reviewer_id: z.number().int().optional(),
  }),
});

export const listOrgInsightsQuery = z.object({
  query: z.object({
    status: z.enum(['Active','Dormant','Competitor']).optional(),
    rating: z.enum(['Strong','Stable','AtRisk','NeedsSupport']).optional(),
    q: z.string().optional(),
  }),
});

export const upsertPeopleRating = z.object({
  body: z.object({
    contact_id: z.number().int(),
    score: z.number().int().min(0).max(100).optional(),
    affinity: z.enum(['Champion','Neutral','Skeptic']).optional(),
    influence_level: z.enum(['Low','Medium','High']).optional(),
    notes: z.string().optional(),
    last_touch_at: z.string().optional(),
  }),
});

export const createFundingSource = z.object({
  body: z.object({
    name: z.string().min(2),
    category: z.string().optional(),
    region: z.string().optional(),
    avg_award_amount: z.number().optional(),
    website: z.string().optional(),
    contact_email: z.string().optional(),
    active: z.boolean().optional(),
  }),
});

export const createGrantCatalog = z.object({
  body: z.object({
    funding_source_id: z.number().int(),
    code: z.string().optional(),
    title: z.string().min(2),
    description: z.string().optional(),
    focus_areas: z.array(z.string()).optional(),
    deadline_at: z.string().optional(),
    typical_amount_min: z.number().optional(),
    typical_amount_max: z.number().optional(),
    url: z.string().optional(),
  }),
});

export const mapOrgGrant = z.object({
  body: z.object({
    account_id: z.number().int(),
    grant_id: z.number().int(),
    stage: z.enum(['Prospect','Applied','Awarded','Closed']).default('Prospect'),
    amount_requested: z.number().optional(),
    amount_awarded: z.number().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    owner_user_id: z.number().int().optional(),
    reminder_at: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const updateOrgGrant = z.object({
  params: z.object({
    id: z.coerce.number().int(),
  }),
  body: mapOrgGrant.shape.body.partial(),
});

export const addWatch = z.object({
  body: z.object({
    entity_type: z.enum(['Org','Person','Grant']),
    entity_id: z.number().int(),
    reason: z.string().optional(),
    priority: z.enum(['High','Medium','Low']).optional(),
  }),
});