# Endpoint region and destination privacy

Research snapshot: 2026-09-07. Frankfurt is deployed and both device browsing trials passed, but Anthony encountered an age-verification prompt and considers mandatory identity disclosure incompatible with Ghostline's privacy requirements. No region migration has been performed.

## Requirement and evidence

Intended browsing, including adult content, must work without compulsory signup for age verification or supplying identity documents, selfies/biometrics or identity-linked verification credentials to destination sites or their verification vendors. Anthony confirmed that the encountered flow required signup. A successful tunnel does not establish this requirement. Record pass/fail without storing destination URLs or sensitive browsing history.

Germany's regulator KJM explains that online pornography must be restricted to adults through age-verification systems under the JMStV. This makes a German exit address a plausible cause of the reported prompt. Age verification does not necessarily disclose the user's identity to the adult site itself; the vendor/method still matters to the privacy requirement. [KJM explanation](https://www.kjm-online.de/themen/aufsicht-internet/pornografie/).

The triggering browser and verification details beyond compulsory signup are not yet confirmed. Private Relay remains enabled, so the visible location in Safari may differ from the EC2 exit. Determine the location seen by the affected browser before attributing this particular prompt to Germany. Site/account policies can impose checks independently of endpoint location. [Apple explains Private Relay’s separate exit address](https://support.apple.com/en-ie/102602).

## Digital-rights guidance

EFF warns that age-verification systems can expose identifying information, associate it with browsing and create breach risks. Open Rights Group's May 2026 joint statement with other organizations likewise warns against expanded age gates and their privacy consequences. These sources support the privacy requirement; neither cited publication supplies a country whitelist. Consult them for threat-model rationale, and current official sources for jurisdiction selection. [EFF brief](https://www.eff.org/files/2026/01/15/age_verification_one_pager_electronic_frontier_foundation.pdf), [Open Rights Group statement](https://www.openrightsgroup.org/press-releases/companies-and-civil-society-warn-that-uk-is-undermining-open-web/).

Do not reuse older country comparisons as current law. EFF's April 2025 EU analysis predates the Commission's March 2026 preliminary DSA findings against four major adult platforms. Those findings concern insufficient protection of minors and effective age verification; they do not establish that every EU website currently requires identity disclosure. [EFF EU analysis](https://www.eff.org/deeplinks/2025/04/digital-identities-and-future-age-verification-europe), [Commission findings](https://germany.representation.ec.europa.eu/nachrichten-und-veranstaltungen/pressemitteilungen/schutz-von-minderjahrigen-pornhub-stripchat-xnxx-und-xvideos-verstossen-gegen-das-gesetz-uber-2026-03-26_de).

## Candidate assessment

| Region | Evidence and assessment |
| --- | --- |
| Frankfurt | German adult-access verification requirements conflict with the desired experience; reconsider this endpoint location. |
| London | Not a suitable alternative for avoiding mandatory age checks: the UK requires strong checks for pornography. [Ofcom](https://www.ofcom.org.uk/agechecks). |
| Paris | Not a suitable alternative: France enforces age-verification obligations on covered adult sites. [Arcom](https://www.arcom.fr/en/press/online-pornography-new-steps-taken-protect-persons-under-18). |
| Zurich | Not an assured escape from age checks: the Swiss Federal Council's February 2026 answer states that covered providers, including pornography platforms, must check age, while acknowledging enforcement challenges. This is not a claim that every foreign site applies a Swiss identity check. [Parliamentary answer 25.4615](https://ws-old.parlament.ch/affairs/20254615). |
| Stockholm / other EU regions | Do not assume absence of national identity checks guarantees access: the EU enforcement described above also matters. Actual current site behavior is untested. |
| Canada Central (`ca-central-1`) | Recommended next candidate to test, not an approved migration or guarantee. Parliament currently lists pornography bill S-209 at second reading in the Commons, not enacted. A changing policy landscape remains a risk. [S-209 status](https://www.parl.ca/legisinfo/en/bill/45-1/s-209). |

Canada also introduced Bill C-34 (Safe Social Media Act) on June 10, 2026; treat proposed measures separately from enacted obligations and recheck status before deployment. [Government proposal](https://www.canada.ca/en/canadian-heritage/services/safe-social-media-act.html), [Parliament status](https://www.parl.ca/legisinfo/en/bill/45-1/c-34). The AWS region identifier is confirmed in [AWS's region list](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html).

Canada is farther from Dubai than Frankfurt; higher latency is an engineering expectation, not a measured result. Pending S-209 is evidence about that bill, not an exhaustive finding that Canada has no relevant obligations. No candidate has yet been demonstrated to satisfy both the privacy and Dubai-performance requirements, and no jurisdiction guarantees that every site will omit verification. Test the actual browsing experience, including normal video use, from a candidate exit before accepting it. Canada remains a provisional trial recommendation, not a demonstrated solution.

## Migration implications

Changing countries requires regional AWS resources and a new regional AMI/EIP, followed by Amnezia/profile updates. Retire the Frankfurt stack and explicitly release its retained EIP after accepting the replacement; do not leave an unintended second permanent endpoint. Keep the one-host steady-state topology, cost tags and secret-storage boundaries. Migration execution remains a subsequent work unit after candidate selection and prompt clarification.
