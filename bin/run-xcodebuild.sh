#! /bin/bash
#
#https://github.com/appium/appium/issues/6955

while [[ "$#" > 1 ]]; do case $1 in
    --keychain-path) keychainPath="$2";;
    --keychain-password) keychainPassword="$2";;
    --project) project="$2";;
    --scheme) scheme="$2";;
    --destination) destination="$2";;
    --xcode-config-file) xcodeConfigFile="$2";;
    *) break;;
  esac; shift; shift
done

if [[ -n "$keychainPath" && -n "$keychainPassword" ]] ; then
    echo "Setting security for iOS device"
    security -v list-keychains -s "$keychainPath"
    security -v unlock-keychain -p $keychainPassword "$keychainPath"
    security set-keychain-settings -t 3600 -l "$keychainPath"
fi

cmd=("xcodebuild" "build" "test" "-project" "$project" "-scheme" "$scheme" "-destination" "$destination" "-configuration" "Debug")

if [[ -n "$xcodeConfigFile" ]] ; then
    cmd=("${cmd[@]}" "-xcconfig" "$xcodeConfigFile")
fi

if command -v xcpretty >/dev/null; then
    cmd=("${cmd[@]}" "|" "xcpretty")
fi

echo "Running command '${cmd[@]}'"

eval ${cmd[@]}
