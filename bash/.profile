# ~/.profile

# PATH OVERRIDES ###########################################################
PATH="$PATH:$HOME/.local/bin"
PATH="$PATH:$HOME/bin"

## Add rbenv if it's installed
if [[ -d "$HOME/.rbenv/bin" ]]
then
    PATH="$HOME/.rbenv/bin:$PATH"
fi

## Add dotnet if it's installed
if [[ -d "$HOME/.dotnet" ]]
then
    PATH="$HOME/.dotnet:$PATH"
    PATH="$HOME/.dotnet/tools:$PATH"
fi

## Add rust cargo if it's installed
if [[ -d "$HOME/.cargo" ]]
then
    PATH="$HOME/.cargo/bin:$PATH"
fi

export PATH
