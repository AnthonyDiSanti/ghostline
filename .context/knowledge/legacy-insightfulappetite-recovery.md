# Legacy insightfulappetite retirement and recovery

Status: **retired November 16, 2026**, account `757999402784`, profile `personal`, region `us-east-1`. Consult before restoring the archived server or changing its retained image/snapshot. This legacy workload is separate from Ghostline gateways and personal-assistant.

## Retained recovery archive

- Private encrypted AMI: **`ami-00b288689f6913188`**, name `insightfulappetite-retirement-encrypted-2026-11-16`, state `available`.
- Backing snapshot: **`snap-0e395128f4a3e0efd`**, completed, encrypted, 8 GiB, owned by the same account. Retain this snapshot and its encryption-key access with the AMI.
- AMI launch permissions and snapshot create-volume permissions are empty; neither archive artifact is shared. The encryption key is enabled.
- The image was created from the stopped original server, then copied to an independent encrypted image. Our temporary unencrypted source image/snapshot were removed after verifying the encrypted copy.
- Private restore manifest and action/readback receipts are preserved in ignored `.local/legacy-retirement-2026-11-16/` in this checkout (directory 0700, files 0600). The manifest was copied from the earlier worktree before retirement; that original metadata copy was left intact.

Before termination, independent DescribeInstances and DescribeVolumes inventories both found **exactly one attached EBS disk**: `/dev/sda1`, 8 GiB. Its device, size, architecture and root mapping match the AMI; the AMI's completed encrypted snapshot traces to the source snapshot recorded when the original image was created. All attached EBS disks were therefore covered. **No boot or application restore trial was performed.** The archive preserves the old installation, including its Ubuntu 18.04 state; it does not prove the old application healthy. Snapshot storage remains billable.

## Authorized retirement and observed result

Anthony explicitly approved disabling termination protection, terminating the legacy instance and releasing its exact EIP after imaging was confirmed. Repeated the complete archive/ownership/attachment checks immediately before the destructive step, then:

- Terminated `i-0b7cf5cef9a199c1f` (`insightfulappetite`, stopped `t3.nano`, x86_64).
- Verified original root volume `vol-01023f0093911d8da` and primary ENI `eni-0892a0b8d0d9450c9` were deleted through their delete-on-termination settings.
- Released `54.88.167.220`, allocation `eipalloc-02d95a61ae8ef591c`, only after observing instance termination. Its allocation is absent from the account's address inventory.
- Final readback at **2026-11-16T14:09:02Z** verifies instance state `terminated`, absent original disk/ENI/EIP, unchanged associations for all six unrelated NVA EIPs, and the retained available private encrypted AMI/completed snapshot with enabled encryption key.

No VPC, subnet, security group, key pair, DNS, other EIP, personal-assistant NAT/ALB or independent security resource was targeted. EC2 can continue listing the terminated instance temporarily; that is not retained running/stopped compute. Termination and release receipts are `termination.json` and `eip-release.json`; full preflight/final evidence is `retirement-preflight.json` / `retirement-verified.json` in the private directory above.

## Restore

1. Launch `ami-00b288689f6913188` in `us-east-1` with a compatible x86_64 instance type. The AMI creates a **new encrypted 8 GiB root EBS volume** from its retained snapshot; the deleted original disk is unnecessary.
2. Review/reapply the manifest's network and access configuration. Original VPC was `vpc-0d6f8639f752a130b`, subnet `subnet-0cd69549a3c92d429`, security groups `sg-0ae125ecb2ad1019b` / `sg-0dbb17e36fe07e567`, key-pair name `insightfulappetite.com`; no IAM instance profile or user data was present. The manifest/AMI do not export the SSH private key. Review the old OS and application before exposing a restored server.
3. Assign a new public address if required, then change only explicitly selected DNS/dependencies after testing. **The released `54.88.167.220` cannot be guaranteed back.** Apex/www records for `insightfulappetite.com` pointed elsewhere at the earlier audit and were not modified. Verify guest boot, filesystems, administrative access and application behavior before calling restoration complete.

The AMI contains launch metadata and block-device mappings referencing snapshots, rather than the original live drives. Included EBS mappings create new independent volumes when launched; the launch storage step can override/add mappings. RAM, instance-store contents and external storage/services are outside those EBS snapshots. [AWS AMI creation](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/creating-an-ami-ebs.html), [block-device mappings](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/block-device-mapping-concepts.html).
