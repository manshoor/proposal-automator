-- Seed 20 winning proposal templates
-- Variables: {job_title}, {description}, {skills}, {budget}, {client_name}

-- ============================================
-- BY JOB TYPE (8 templates)
-- ============================================

INSERT INTO templates (name, content, variables, is_default) VALUES
('Web Development (React/Node)',
'I noticed you need {job_title} — I''ve built similar applications using {skills} and can hit the ground running.

Looking at your requirements, I''d approach this by first setting up the core architecture, then building out the key features in sprints so you can review progress early. I''ve delivered 15+ React/Node projects on Upwork with clean, maintainable code and solid test coverage.

My most relevant project was a similar web app where I built the full stack from scratch — frontend in React with a Node.js API. Delivered ahead of schedule.

I can start immediately. What''s your timeline looking like — do you have a hard deadline?',
ARRAY['job_title', 'skills'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('WordPress / CMS',
'Your {job_title} project is right in my wheelhouse — I''ve customized, built, and fixed 50+ WordPress sites ranging from simple blogs to complex multisite setups.

For your specific needs, I''d review the current setup first, then implement changes with proper staging so nothing breaks on the live site. I''m experienced with theme customization, custom plugins, WooCommerce, ACF, Elementor, and performance optimization.

One thing I always do: I''ll document every change so you''re never locked into needing me for future updates. You''ll own everything.

Happy to do a quick screen share to discuss the approach — when works for you?',
ARRAY['job_title'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('Mobile App Development',
'I can build this {job_title} — I''ve shipped 10+ mobile apps using {skills} across both iOS and Android.

Here''s how I''d approach it: start with the core user flow, get a working prototype in the first week, then iterate based on your feedback. I prioritize clean architecture so the codebase stays maintainable as features grow.

My recent app project had similar complexity — a cross-platform app with real-time features, push notifications, and payment integration. It''s live on both app stores with a 4.7 rating.

What''s the priority feature you''d want to see working first?',
ARRAY['job_title', 'skills'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('UI/UX Design',
'Your {job_title} caught my eye — the design challenge here is interesting and I have specific ideas for how to approach it.

I work in Figma and deliver complete design systems: wireframes first for alignment, then high-fidelity mockups with interactive prototypes you can click through. Every design is built with developer handoff in mind — proper spacing, components, and style guides.

For this project, I''d want to understand your users better before jumping into visuals. The best designs solve real user problems, not just look pretty.

Could you share any existing brand guidelines or competitor references you like?',
ARRAY['job_title'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('API / Backend Development',
'I can architect and build this {job_title} with clean, well-documented endpoints that your team will actually enjoy working with.

My approach: start with the data model and API contract, validate with you, then build out endpoints with proper authentication, validation, error handling, and rate limiting. I write APIs that are production-ready from day one — not prototypes that need rewriting.

I''ve built REST and GraphQL APIs handling millions of requests using {skills}. My last API project reduced the client''s response times by 60% through proper caching and query optimization.

Do you have an existing API spec or database schema, or are we designing from scratch?',
ARRAY['job_title', 'skills'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('E-commerce',
'I''ve built and optimized 20+ e-commerce stores and your {job_title} project fits my experience perfectly.

For your store, I''d focus on three things that directly impact revenue: page load speed (under 2 seconds), frictionless checkout flow, and mobile optimization (70%+ of traffic is mobile now). I handle everything from product setup to payment integration to shipping configuration.

My last e-commerce project increased the client''s conversion rate by 35% through UX improvements and page speed optimization. I know what actually moves the needle.

What platform are you using — Shopify, WooCommerce, or custom? And what''s your current monthly order volume?',
ARRAY['job_title'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('Bug Fix / Debugging',
'I can jump on this right away. I''ve been debugging and fixing issues in {skills} codebases for 5+ years and have a systematic approach to finding root causes fast.

My process: reproduce the bug, trace it to the source, fix it, test the fix, and document what caused it so it doesn''t happen again. I don''t do band-aid fixes — I find the actual root cause.

For this issue, I already have some hypotheses based on your description. I should be able to identify and fix it within a few hours.

Can you share access to the codebase and steps to reproduce the bug?',
ARRAY['skills'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('Data / Scraping / Automation',
'I can build this {job_title} — I specialize in data extraction, transformation, and automation pipelines using {skills}.

For your project, I''d build a robust solution that handles edge cases: rate limiting, proxy rotation, error recovery, and data validation. Too many scrapers break silently — mine monitor themselves and alert when something changes.

My last automation project saved the client 40 hours per week of manual data entry by automating their entire workflow. Clean data, reliable delivery, zero maintenance needed from their side.

What format do you need the data in, and how frequently should it run?',
ARRAY['job_title', 'skills'], false);

-- ============================================
-- BY APPROACH STYLE (6 templates)
-- ============================================

INSERT INTO templates (name, content, variables, is_default) VALUES
('Direct & Confident',
'I''ve done this exact type of work before and I can deliver it well. Here''s what I''d do for your {job_title}:

First, I''d review your existing setup to understand constraints. Then build the solution using {skills}, with daily progress updates so you always know where things stand. I test thoroughly before delivering — you won''t be debugging my work.

I''ve completed 30+ similar projects on Upwork with a 100% job success score. I don''t overpromise and I don''t miss deadlines.

I''m available to start today. What''s the best way to discuss the specifics?',
ARRAY['job_title', 'skills'], true);

INSERT INTO templates (name, content, variables, is_default) VALUES
('Question-Led Opener',
'Quick question about your {job_title} — are you looking for someone who just implements the spec, or do you also want input on the best technical approach?

I ask because I''ve built similar systems where small architectural decisions early on saved weeks of rework later. I''d love to bring that experience to your project.

My background in {skills} means I can handle both the implementation and the strategic thinking. My last client specifically mentioned in their review that my proactive problem-solving saved them significant time and budget.

Either way, I''m ready to start. What matters most to you — speed, quality, or cost?',
ARRAY['job_title', 'skills'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('Proof-First',
'Last month I delivered a project nearly identical to your {job_title} — on time, under budget, and the client extended the contract for 3 additional months.

Here are the specifics: I built a complete solution using {skills}, handling everything from initial setup to deployment. The client rated me 5 stars and wrote "exceeded expectations in every way."

For your project, I''d apply the same approach: clear milestones, daily communication, and delivery that actually works in production — not just in a demo.

Want to see my portfolio piece for that project? I can share it privately.',
ARRAY['job_title', 'skills'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('Problem-Solution',
'Reading your {job_title} description, I think the core challenge here is {description}. I''ve solved this exact problem before, and the key is getting the foundation right.

Here''s what I''d do differently from most freelancers: instead of jumping straight into code, I''d spend the first day mapping out the architecture with you. This prevents the "build, realize it''s wrong, rebuild" cycle that wastes time and money.

Then I''d deliver in iterations so you can validate each piece before I move on. No surprises at the end.

I''m confident I can deliver this within your {budget} budget. Shall we schedule a quick call to align on the approach?',
ARRAY['job_title', 'description', 'budget'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('Quick Turnaround',
'I can get this done fast. Your {job_title} is straightforward for someone with my experience in {skills}, and I''m available to start right now.

My plan: dive in immediately, get the first deliverable to you within 24 hours, and wrap up the full project within the timeline you need. I''ve done rush jobs before — speed doesn''t mean I cut corners on quality.

I''m online most hours of the day and respond to messages within minutes, not hours. You won''t be waiting around wondering what''s happening.

When do you need this completed by?',
ARRAY['job_title', 'skills'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('Budget-Conscious Value',
'I can deliver great results on your {job_title} within your {budget} budget. Here''s how:

I focus on what actually matters — the features that drive value for your business — and avoid over-engineering. Clean, simple code that works is better than complex code that''s hard to maintain.

I''ve delivered 20+ projects in this budget range and my clients consistently say they got more than they expected. I''ll be upfront about what''s realistic for the budget so there are no surprises.

What''s the single most important feature for you? I''ll prioritize that first.',
ARRAY['job_title', 'budget'], false);

-- ============================================
-- BY BUDGET TIER (3 templates)
-- ============================================

INSERT INTO templates (name, content, variables, is_default) VALUES
('Micro Budget (<$100)',
'I can handle this quickly and cleanly. For {job_title}, I''ll get it done right the first time — no back and forth.

I''ve done hundreds of small tasks like this and I know how to deliver efficiently. You''ll get clean work, fast turnaround, and a hassle-free experience.

Ready to start immediately. Share access and I''ll have it done within hours.',
ARRAY['job_title'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('Mid Budget ($100-$1000)',
'Your {job_title} is a great fit for my skill set. I''ve done 25+ projects in this scope using {skills} and I deliver consistently.

Here''s my approach: I''ll start with a quick review of requirements, share a brief plan for your approval, then build and deliver with checkpoints along the way. You''ll always know the status and can course-correct early if needed.

My recent comparable project was delivered in 5 days, under budget, with a 5-star review. I aim for the same outcome here.

What''s the ideal timeline for you?',
ARRAY['job_title', 'skills'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('Enterprise Budget ($1000+)',
'I''ve reviewed your {job_title} requirements carefully and I''m confident I can deliver a production-grade solution.

For a project of this scope, here''s my structured approach:
Phase 1: Requirements deep-dive and technical architecture (2-3 days)
Phase 2: Core implementation with weekly demos (main development phase)
Phase 3: Testing, optimization, and deployment
Phase 4: Documentation and knowledge transfer

I''ve managed and delivered 10+ projects in this budget range. Each one included proper documentation, testing, and a smooth handoff. I treat larger projects like a professional engagement, not a freelance gig.

I''d like to schedule a 30-minute call to discuss the requirements in detail. When are you available this week?',
ARRAY['job_title'], false);

-- ============================================
-- SPECIALIZED (3 templates)
-- ============================================

INSERT INTO templates (name, content, variables, is_default) VALUES
('Fixed-Price with Milestones',
'I can deliver your {job_title} for {budget} with clear milestones so you can track progress and release payment with confidence.

Proposed milestone breakdown:
- Milestone 1: Project setup, architecture, and initial delivery
- Milestone 2: Core feature development and integration
- Milestone 3: Testing, refinement, final delivery, and documentation

Each milestone is a working deliverable you can review and approve before we move forward. No surprises at the end.

I''ve completed 40+ fixed-price projects with this structure and it works every time — you stay in control, I stay focused.

Does this breakdown work for you, or would you prefer to adjust the milestones?',
ARRAY['job_title', 'budget'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('Hourly / Long-Term Partnership',
'I''m interested in {job_title} as an ongoing engagement. I work best in long-term partnerships where I deeply understand the codebase and can make increasingly impactful contributions over time.

My approach to hourly work: I track time meticulously, communicate daily, and never pad hours. You''ll get a detailed breakdown of what I worked on and for how long. Most of my long-term clients keep me because the value is obvious.

I''m currently available for 20-30 hours per week and can ramp up as needed. I''ve maintained some client relationships for 2+ years.

What does a typical week of work look like for this role?',
ARRAY['job_title'], false);

INSERT INTO templates (name, content, variables, is_default) VALUES
('Hidden Instruction Acknowledgment',
'I read through your entire {job_title} description carefully — including the specific instruction you included. I follow directions precisely because attention to detail matters in the actual work too.

Now, about the project: I have direct experience with {skills} and I can deliver exactly what you need. My approach would be to start with a clear understanding of your requirements, deliver iteratively, and make sure every detail is right.

I''ve completed 30+ similar projects on Upwork and I treat every job with the same level of care I showed by reading your full posting.

What''s the biggest challenge you''re facing with this project right now?',
ARRAY['job_title', 'skills'], false);
