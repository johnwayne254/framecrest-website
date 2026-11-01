# Editor performance tracking

## Deployment

For an existing FrameCrest Supabase project:

1. Confirm the QA/team-role migration has already been applied (the dashboard uses `projects.qa_id`).
2. Open Supabase SQL Editor.
3. Run the complete `dashboard/editor_performance.sql` script.
4. Deploy the dashboard files from this branch.
5. Sign in as an administrator and open **Performance**.

For a new Supabase project, the current `dashboard/schema.sql` includes the performance tracking schema.

## Balanced scorecard

| Measure | Weight | Calculation |
|---|---:|---|
| Quality | 35% | Average recorded QA/editor quality review score |
| On-time delivery | 25% | Delivered projects completed on or before their due date |
| Productivity | 20% | Delivered project count compared with the highest editor count in the selected period |
| Revision avoidance | 10% | 100 minus revision requests per submission, with a floor of zero |
| Consistency | 10% | Active production weeks divided by observed weeks since the first recorded production event |

If a measure has no usable records in the selected period, it is excluded and the remaining weights are normalized. The dashboard shows weight coverage alongside each editor. An overall score is withheld until at least 50% of the score weight has usable data, preventing a single available measure from looking like a complete assessment.

## Event tracking

The database trigger records editor assignment, work started, submission to QA, revision requested, resubmission, QA passed and delivery. Due dates are snapshotted when events occur so later deadline edits do not rewrite on-time history.

The migration creates a baseline assignment event for projects already assigned to editors. It does not reconstruct old start, submission, revision or delivery dates. Performance tracking therefore becomes historically meaningful from the migration date onward.

Event rows retain the editor ID and name snapshot if a staff profile is later deleted. Editors can read only their own events; QA reviewers can read events for projects assigned to them; administrators can read all performance events. There are no direct client write permissions on the event table.

## Interpretation

Productivity is a relative project-count measure, not a complexity- or quantity-adjusted output measure. Consistency reflects recorded production activity, not attendance or working hours. Scores should be used alongside project complexity, editor workload and manager judgement rather than as the sole basis for employment decisions.
