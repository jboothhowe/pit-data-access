# Comments on Dimensions Proposal

Our key principles are:
1. Every row represents a maximally disaggregated, atomic count corresponding to some combination of dimensions.
2. Every dimension should itself be maximally atomic - instead of combining multiple kinds of facts into a single dimension, 
we should disentangle the categories and use "dimension set" constraints to dictate which combinations are supported in the data.

From (2), I believe we should unbundle the current "household type" into more dimensions, even if many are uncombinable. For a motivating
example, veteran status and family status are separate dimensions of facts, so they should be separate columns, even if we don't actually
support dimension sets that combine these.
Therefore, I believe a more apt set of dimensions emerging from household type would be something akin to:
- in_family: true/false/null
- full_household: true/null
- veteran: true/null
- unaccompanied_youth_aged: 18, 24, null
- parent_of_youth_aged: 18, 24, null
- accompanied_youth: true/null
- chronic: true/false/null

most of these would not ever be supported in the same dimension sets, as they are cross-cutting slices that count the same individuals,
but this is fine - we'd rather unbundle the columns into meaningful dimensions and limit their combination via supported dimension sets.

Another option along similar lines is to try to extract the age from the Unaccompanied Youth and Parent of Youth categories so that these become
just booleans, and instead use the existing age column to encode the associated age. I'm not sure if this works well; certainly there would
be a more limited range of ages supported in such combinations, but I think that might be fine; as ever, we just would only include combinations
that exist in the data. So I suspect this could work well, but I would appreciate your feedback.

Finally, it seems to me that given your findings on race and hispanic ethnicity, these could be separate dimensions in a two column model:
- race: enum
- hispanic: bool
Verify that this makes sense.

With respect to limited age support in earlier years, I think it's fine for us to support all the ranges, but not include counts for
ranges that are unsupported in a given year, i.e. the 110 bucket has the whole count from 24-110 for those years.
