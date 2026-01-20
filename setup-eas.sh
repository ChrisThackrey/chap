#!/bin/bash

echo "🚀 Setting up EAS Build for Chap Dating App"
echo "=========================================="
echo ""

# Step 1: Login
echo "📝 Step 1: Login to Expo"
echo "If you don't have an account, you'll be prompted to create one."
echo ""
eas login

if [ $? -ne 0 ]; then
    echo "❌ Login failed. Please try again."
    exit 1
fi

echo ""
echo "✅ Login successful!"
echo ""

# Step 2: Configure project
echo "📦 Step 2: Configuring project..."
echo ""
eas build:configure --platform all

if [ $? -ne 0 ]; then
    echo "❌ Configuration failed."
    exit 1
fi

echo ""
echo "✅ Project configured!"
echo ""

# Step 3: Set up secret
echo "🔐 Step 3: Setting up OpenAI API key secret..."
echo ""
echo "Please enter your OpenAI API key:"
read -s OPENAI_KEY

if [ -z "$OPENAI_KEY" ]; then
    echo "❌ No API key provided. Skipping secret setup."
    echo "You can set it up later with:"
    echo "  eas secret:create --scope project --name OPENAI_API_KEY --value 'your-key' --type string"
else
    eas secret:create --scope project --name OPENAI_API_KEY --value "$OPENAI_KEY" --type string

    if [ $? -eq 0 ]; then
        echo "✅ Secret created successfully!"
    else
        echo "⚠️  Secret creation failed, but you can set it up later."
    fi
fi

echo ""
echo "=========================================="
echo "🎉 Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Build for iOS:     eas build --platform ios --profile development"
echo "2. Build for Android: eas build --platform android --profile development"
echo ""
echo "See BUILD_GUIDE.md for detailed instructions."
echo ""
