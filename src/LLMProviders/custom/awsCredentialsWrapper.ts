import { fromIni } from "@aws-sdk/credential-providers";
import {
  AwsCredentialIdentity,
  IniSection,
  ParsedIniData,
  SharedConfigFiles,
} from "@aws-sdk/types";
import { loadSharedConfigFiles } from "@smithy/shared-ini-file-loader";

/** Handles AWS Credentials and Access */
export class AwsCredentialsWrapper {
  async getAWSCredentialIdentity(
    profileName: string
  ): Promise<AwsCredentialIdentity> {
    const profile = await this.getAWSProfile(profileName);

    if (profile === null)
      throw new Error(
        `Profile [${profileName}] not found in the AWS Config/Credential files.`
      );

    // Get the provider for the profile
    const provider = fromIni({
      profile: profileName,
    });

    // Get the identity object proper
    const identity = await provider();

    return identity;
  }

  async getRegionFromAWSProfile(profileName: string): Promise<string | null> {
    const profile = (await this.getAWSProfile(profileName)) as IniSection;
    if (profile !== null) {
      if (profile.region) return profile.region;
      else
        throw new Error(`Profile [${profileName}] does not specify a region`);
    }

    throw new Error(
      `Profile [${profileName}] does not exist in the AWS configuration.`
    );
  }

  // Returns the profile data for the given profile name
  // from the AWS Config/Credentials files
  private async getAWSProfile(profileName: string): Promise<IniSection | null> {
    let sharedFiles: SharedConfigFiles;

    try {
      sharedFiles = await loadSharedConfigFiles({ ignoreCache: true });
    } catch (e) {
      throw new Error(`Unable to load the AWS Config/Credentials files. ${e}`);
    }

    // First from credentials file
    let profile = sharedFiles.credentialsFile?.[profileName];
    if (profile && profile !== undefined) {
      return profile;
    } else {
      // If not, then from config file
      profile = sharedFiles.configFile?.[profileName];
      if (profile && profile !== undefined) {
        return profile;
      }
    }

    return null;
  }

  // Loads the AWS Config/Credentials files and returns
  // A distinct list of profile names, sorted alphabetically.
  // Helper class for dropdowns, etc
  async getAwsProfileNames(): Promise<string[]> {
    const sharedFiles = await loadSharedConfigFiles();

    let iniData = sharedFiles.credentialsFile as ParsedIniData;

    let profiles: string[] = [];
    profiles = Object.keys(iniData);

    iniData = sharedFiles.configFile as ParsedIniData;
    Object.keys(iniData).forEach((key) => {
      if (!profiles.includes(key)) {
        profiles.push(key);
      }
    });

    profiles = profiles.sort((a, b) => a.localeCompare(b));

    return profiles;
  }
}
