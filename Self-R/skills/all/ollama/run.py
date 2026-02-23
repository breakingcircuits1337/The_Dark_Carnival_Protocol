#!/usr/bin/env python3
"""
Ollama Local LLM Runner
Usage: python run.py [options] "prompt"
Options:
  -m, --model MODEL   Model to use (default: joker)
  -s, --stream        Stream responses
  -i, --interactive   Interactive mode
  --system PROMPT     System prompt
"""
import subprocess
import argparse
import sys
import json
import os

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")

DEFAULT_CONFIG = {
    "default_model": "joker",
    "temperature": 0.7,
    "max_tokens": 512,
    "system_prompt": "You are a helpful AI assistant."
}

def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            return {**DEFAULT_CONFIG, **json.load(f)}
    return DEFAULT_CONFIG

def run_ollama(prompt, model=None, stream=False, system_prompt=None, temperature=None, max_tokens=None):
    config = load_config()
    
    model = model or config["default_model"]
    temperature = temperature or config["temperature"]
    max_tokens = max_tokens or config["max_tokens"]
    system_prompt = system_prompt or config.get("system_prompt", "")
    
    cmd = ["ollama", "run", model]
    
    if stream:
        process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        print(f"Using model: {model}")
        print("-" * 40)
        
        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        process.stdin.write(full_prompt + "\n")
        process.stdin.flush()
        
        for line in process.stdout:
            print(line, end="")
        
        process.wait()
        return
    else:
        result = subprocess.run(
            ["ollama", "run", model, prompt],
            capture_output=True,
            text=True,
            input=prompt
        )
        
        if result.returncode != 0:
            print(f"Error: {result.stderr}", file=sys.stderr)
            return None
        
        return result.stdout

def interactive_mode(model=None, system_prompt=None):
    config = load_config()
    model = model or config["default_model"]
    system_prompt = system_prompt or config.get("system_prompt", "")
    
    print(f"Ollama Interactive Mode (model: {model})")
    print("Type 'quit' or 'exit' to stop")
    print("-" * 40)
    
    while True:
        try:
            prompt = input("\n> ")
            if prompt.lower() in ("quit", "exit"):
                break
            
            full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
            
            result = subprocess.run(
                ["ollama", "run", model],
                input=full_prompt,
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                print(result.stdout)
            else:
                print(f"Error: {result.stderr}", file=sys.stderr)
                
        except KeyboardInterrupt:
            break
        except EOFError:
            break
    
    print("\nGoodbye!")

def main():
    parser = argparse.ArgumentParser(description="Run Ollama local LLMs")
    parser.add_argument("prompt", nargs="?", help="Prompt to send to model")
    parser.add_argument("-m", "--model", help="Model to use")
    parser.add_argument("-s", "--stream", action="store_true", help="Stream responses")
    parser.add_argument("-i", "--interactive", action="store_true", help="Interactive mode")
    parser.add_argument("--system", help="System prompt")
    parser.add_argument("--temp", type=float, help="Temperature")
    parser.add_argument("--max-tokens", type=int, help="Max tokens")
    
    args = parser.parse_args()
    
    if args.interactive:
        interactive_mode(args.model, args.system)
    elif args.prompt:
        result = run_ollama(
            args.prompt,
            model=args.model,
            stream=args.stream,
            system_prompt=args.system,
            temperature=args.temp,
            max_tokens=args.max_tokens
        )
        if result and not args.stream:
            print(result)
    else:
        # Read from stdin
        prompt = sys.stdin.read().strip()
        if prompt:
            result = run_ollama(prompt, model=args.model)
            if result:
                print(result)
        else:
            parser.print_help()

if __name__ == "__main__":
    main()
