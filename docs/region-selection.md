# Endpoint region and destination privacy

Decision snapshot: 2026-09-07. Anthony selected Cape Town (`af-south-1`) after supplying [additional research](archive/vpn-location-research.md). Its independent deployment and macOS/iOS practical trials passed. Anthony subsequently requested Frankfurt teardown because it is no longer needed; see [lifecycle evidence](launch.md). This supersedes the earlier instruction to preserve Frankfurt during comparison. Frankfurt’s device browsing trials passed, but mandatory verification signup remains a privacy failure.

## Requirement and evidence

Intended browsing, including adult content, must work without compulsory signup for age verification or supplying identity documents, selfies/biometrics or identity-linked verification credentials to destination sites or their verification vendors. Anthony confirmed that the encountered flow required signup. A successful tunnel does not establish this requirement. Record pass/fail without storing destination URLs or sensitive browsing history.

Germany's regulator KJM explains that online pornography must be restricted to adults through age-verification systems under the JMStV. This makes a German exit address a plausible cause of the reported prompt. Age verification does not necessarily disclose the user's identity to the adult site itself; the vendor/method still matters to the privacy requirement. [KJM explanation](https://www.kjm-online.de/themen/aufsicht-internet/pornografie/).

The triggering browser and verification details beyond compulsory signup are not yet confirmed. Private Relay remains enabled, so the visible location in Safari may differ from the EC2 exit. Determine the location seen by the affected browser before attributing this particular prompt to Germany. Site/account policies can impose checks independently of endpoint location. [Apple explains Private Relay’s separate exit address](https://support.apple.com/en-ie/102602).

## Digital-rights guidance

EFF warns that age-verification systems can expose identifying information, associate it with browsing and create breach risks. Open Rights Group's May 2026 joint statement with other organizations likewise warns against expanded age gates and their privacy consequences. These sources support the privacy requirement; neither cited publication supplies a country whitelist. Consult them for threat-model rationale, and current official sources for jurisdiction selection. [EFF brief](https://www.eff.org/files/2026/01/15/age_verification_one_pager_electronic_frontier_foundation.pdf), [Open Rights Group statement](https://www.openrightsgroup.org/press-releases/companies-and-civil-society-warn-that-uk-is-undermining-open-web/).

Do not reuse older country comparisons as current law. EFF's April 2025 EU analysis predates the Commission's March 2026 preliminary DSA findings against four major adult platforms. Those findings concern insufficient protection of minors and effective age verification; they do not establish that every EU website currently requires identity disclosure. [EFF EU analysis](https://www.eff.org/deeplinks/2025/04/digital-identities-and-future-age-verification-europe), [Commission findings](https://germany.representation.ec.europa.eu/nachrichten-und-veranstaltungen/pressemitteilungen/schutz-von-minderjahrigen-pornhub-stripchat-xnxx-und-xvideos-verstossen-gegen-das-gesetz-uber-2026-03-26_de).

## Selected trial: Cape Town

The supplied report favors South Africa for internet openness and lower age-verification pressure. Its external citation tokens cannot be resolved from the imported file, so its absence-of-law finding remains attributed to that research. Independently consulted [Freedom House’s 2025 South Africa assessment](https://freedomhouse.org/country/south-africa/freedom-net/2025), which rates internet freedom Free, 73/100 and reports no website blocking. Neither this rating nor country choice guarantees a destination will omit verification. Anthony subsequently reported the Cape Town macOS and iOS practical trials passed; see [launch evidence](launch-cape-town.md). No quantitative Dubai performance benchmark or exhaustive legal guarantee follows from that report.

AWS account monitoring observed `af-south-1` transition from `ENABLING` to `ENABLED` after Anthony enabled it. Regional EC2 preflight then confirmed the pinned Canonical image, AZ and instance offering. [Deployment workflow](development.md) owns the commands; [Cape Town launch evidence](launch-cape-town.md) owns resulting resources and client checks.

## Earlier candidate assessment (superseded selection)


| Region | Evidence and assessment |
| --- | --- |
| Frankfurt | German adult-access verification requirements conflict with the desired experience; reconsider this endpoint location. |
| London | Not a suitable alternative for avoiding mandatory age checks: the UK requires strong checks for pornography. [Ofcom](https://www.ofcom.org.uk/agechecks). |
| Paris | Not a suitable alternative: France enforces age-verification obligations on covered adult sites. [Arcom](https://www.arcom.fr/en/press/online-pornography-new-steps-taken-protect-persons-under-18). |
| Zurich | Not an assured escape from age checks: the Swiss Federal Council's February 2026 answer states that covered providers, including pornography platforms, must check age, while acknowledging enforcement challenges. This is not a claim that every foreign site applies a Swiss identity check. [Parliamentary answer 25.4615](https://ws-old.parlament.ch/affairs/20254615). |
| Stockholm / other EU regions | Do not assume absence of national identity checks guarantees access: the EU enforcement described above also matters. Actual current site behavior is untested. |
| Canada Central (`ca-central-1`) | Previously proposed candidate; superseded by the owner-selected Cape Town trial. Parliament currently lists pornography bill S-209 at second reading in the Commons, not enacted. A changing policy landscape remains a risk. [S-209 status](https://www.parl.ca/legisinfo/en/bill/45-1/s-209). |

Canada also introduced Bill C-34 (Safe Social Media Act) on June 10, 2026; treat proposed measures separately from enacted obligations and recheck status before deployment. [Government proposal](https://www.canada.ca/en/canadian-heritage/services/safe-social-media-act.html), [Parliament status](https://www.parl.ca/legisinfo/en/bill/45-1/c-34). The AWS region identifier is confirmed in [AWS's region list](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html).

Canada is farther from Dubai than Frankfurt; higher latency is an engineering expectation, not a measured result. Pending S-209 is evidence about that bill, not an exhaustive finding that Canada has no relevant obligations. At the earlier comparison stage no candidate had been tested; Cape Town has since passed the owner-reported macOS/iOS practical trial. No jurisdiction guarantees that every site will omit verification. Test the actual browsing experience, including normal video use, from a candidate exit before accepting it. Canada was not selected; Cape Town is the current trial.

## Independent deployment implications

Cape Town has independent regional AWS resources, an AMI/EIP, dedicated SSH key and fresh Amnezia runtime/profile identity. Frankfurt has been fully retired, including retained-EIP release. There is one host per live target; no automatic failover or lifecycle controller is needed. Future selectable/on-demand exits should reuse these boundaries. Deletion and retained-EIP cleanup require an explicit lifecycle decision, not an implicit consequence of changing the preferred region.
