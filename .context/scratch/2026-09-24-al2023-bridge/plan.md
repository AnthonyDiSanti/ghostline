# Retired AL2023 boot-gate experiment

Retired September 26 in favor of official Bottlerocket and an upstream host-ctr repair. Shell user data installed the gate too late for the first Docker start. A derivative AMI with preinstalled units passed synthetic first-boot, reboot, failure-closed recovery and stop/start tests, but the real gateway was never ported. The trial hosts, stack, AMI and snapshot were removed after qualification on September 25. Git history retains the trial implementation and detailed evidence; no AL2023 serving path remains.
