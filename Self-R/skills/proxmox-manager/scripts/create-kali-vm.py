#!/home/bc/.venvs/base/bin/python3
"""
Create Kali Linux VM on Proxmox with OpenCode BC environment
Usage: python3 create-kali-vm.py [VMID] [VM_NAME]
"""

import sys
import os
import time
from proxmoxer import ProxmoxAPI

# Configuration
PROXMOX_HOST = os.getenv("PROXMOX_HOST", "192.168.1.115")
PROXMOX_PORT = os.getenv("PROXMOX_PORT", "8006")
PROXMOX_USER = os.getenv("PROXMOX_USER", "root@pam")
PROXMOX_PASS = os.getenv("PROXMOX_PASS", "")

# VM Configuration
VM_CONFIG = {
    "memory": 8192,  # 8GB RAM
    "cores": 4,      # 4 CPU cores
    "sockets": 1,
    "cpu": "host",   # Use host CPU type
    "scsi0": "local-store:32,format=qcow2",  # 32GB disk
    "ide2": "local-store:iso/kali-linux-2024.3-installer-amd64.iso,media=cdrom",  # Kali ISO
    "boot": "order=ide2;scsi0",  # Boot from CD first
    "net0": "virtio,bridge=vmbr0",  # Network
    "ostype": "l26",  # Linux 2.6+
    "agent": 1,  # Enable QEMU guest agent
    "name": "kali-opencode-bc",
}

def find_next_vmid(proxmox):
    """Find next available VMID."""
    used_ids = set()
    
    for node in proxmox.nodes.get():
        node_name = node['node']
        # Get VMs
        for vm in proxmox.nodes(node_name).qemu.get():
            used_ids.add(int(vm['vmid']))
        # Get containers
        for ct in proxmox.nodes(node_name).lxc.get():
            used_ids.add(int(ct['vmid']))
    
    # Find next available ID starting from 200
    for vmid in range(200, 1000):
        if vmid not in used_ids:
            return vmid
    
    return None

def create_kali_vm():
    """Create Kali Linux VM on Proxmox."""
    
    if not PROXMOX_PASS:
        print("❌ Error: PROXMOX_PASS environment variable not set")
        sys.exit(1)
    
    # Get VMID and name from args or use defaults
    if len(sys.argv) >= 2:
        vmid = int(sys.argv[1])
    else:
        vmid = None
    
    vm_name = sys.argv[2] if len(sys.argv) >= 3 else VM_CONFIG['name']
    
    try:
        # Connect to Proxmox
        print("🔌 Connecting to Proxmox...")
        proxmox = ProxmoxAPI(
            PROXMOX_HOST,
            user=PROXMOX_USER,
            password=PROXMOX_PASS,
            verify_ssl=False,
            port=int(PROXMOX_PORT)
        )
        
        # Get first node
        nodes = proxmox.nodes.get()
        if not nodes:
            print("❌ No nodes found!")
            sys.exit(1)
        
        node_name = nodes[0]['node']
        print(f"✅ Connected to node: {node_name}")
        
        # Find next VMID if not specified
        if vmid is None:
            vmid = find_next_vmid(proxmox)
            if not vmid:
                print("❌ Could not find available VMID!")
                sys.exit(1)
        
        print(f"🆔 Using VMID: {vmid}")
        
        # Check if ISO exists
        print("📀 Checking for Kali ISO...")
        try:
            storage_content = proxmox.nodes(node_name).storage('local-store').content.get()
            iso_exists = any(item.get('volid', '').endswith('.iso') and 'kali' in item.get('volid', '').lower() 
                           for item in storage_content)
            
            if not iso_exists:
                print("⚠️  Warning: Kali ISO not found in local-store!")
                print("   Expected: kali-linux-2024.3-installer-amd64.iso")
                print("   Please upload the ISO via Proxmox web interface first.")
                print(f"   URL: https://{PROXMOX_HOST}:8006")
                response = input("\nContinue anyway? (y/N): ")
                if response.lower() != 'y':
                    sys.exit(1)
        except Exception as e:
            print(f"⚠️  Could not check ISO: {e}")
        
        # Create VM
        print(f"🖥️  Creating VM {vmid} - {vm_name}...")
        
        config = {
            "vmid": vmid,
            "name": vm_name,
            "memory": VM_CONFIG['memory'],
            "cores": VM_CONFIG['cores'],
            "sockets": VM_CONFIG['sockets'],
            "cpu": VM_CONFIG['cpu'],
            "scsi0": VM_CONFIG['scsi0'],
            "ide2": VM_CONFIG['ide2'],
            "boot": VM_CONFIG['boot'],
            "net0": VM_CONFIG['net0'],
            "ostype": VM_CONFIG['ostype'],
            "agent": VM_CONFIG['agent'],
        }
        
        result = proxmox.nodes(node_name).qemu.create(**config)
        print(f"✅ VM created successfully!")
        print(f"   VMID: {vmid}")
        print(f"   Name: {vm_name}")
        print(f"   RAM: {VM_CONFIG['memory']} MB ({VM_CONFIG['memory']//1024} GB)")
        print(f"   CPU: {VM_CONFIG['cores']} cores")
        print(f"   Disk: 32 GB")
        
        # Start VM
        print(f"\n🚀 Starting VM {vmid}...")
        proxmox.nodes(node_name).qemu(vmid).status.start.post()
        print("✅ VM started!")
        
        print("\n" + "="*70)
        print("📋 NEXT STEPS:")
        print("="*70)
        print(f"1. Open Proxmox console: https://{PROXMOX_HOST}:8006")
        print(f"2. Navigate to VM {vmid} ({vm_name})")
        print("3. Open console and complete Kali Linux installation")
        print("4. After installation, shutdown and remove ISO:")
        print(f"   python3 setup-kali-post-install.py {vmid}")
        print("\n⚠️  IMPORTANT: The VM is configured to boot from CD (ISO)")
        print("   Complete the installation, then run the post-install script.")
        print("="*70)
        
        return vmid
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    vmid = create_kali_vm()
    print(f"\n📝 Save this VMID for later: {vmid}")
