pipeline {
    agent any
    stages {
        stage('Checkout') {
            steps {
                sh 'git pull origin main'
            }
        }
        stage('Build') {
            steps {
                sh 'docker build --pull --rm -f "Dockerfile" -t blog:latest "."'
            }
        }
        stage('Test') {
            steps {
                echo 'Running unit tests...'
                sh 'trivy image --exit-code 0 --severity MEDIUM,HIGH,CRITICAL --format table -o trivy-report.txt blog:latest'
            }
        }
        stage('Dependency Scan') {
            steps {
                withCredentials([
                    string(credentialsId: 'nvd-api-key', variable: 'NVD_API_KEY')
                    ]) {
                        dependencyCheck(
                            additionalArguments: """
                            --scan .
                            --format XML
                            --nvdApiKey $NVD_API_KEY
                            """,
                            odcInstallation: 'DependencyCheck'
                            )
                    }
            }
        }
        stage('Run') {
            steps {
                sh 'docker stop blog || true'
                sh 'docker rm blog || true'
                sh 'docker run -d -p 3000:3000 --name blog blog'
            }
        }
        stage('Wait for application') {
            steps {
                sh '''
                    echo "Waiting for blog to become ready..."
        
                    for i in $(seq 1 30); do
                        if curl -fsS --max-time 2 http://127.0.0.1:3000/ >/dev/null; then
                            echo "Blog is ready."
                            exit 0
                        fi
        
                        echo "Not ready yet ($i/30)"
                        sleep 2
                    done
        
                    echo "Blog did not become ready."
                    docker logs blog
                    exit 1
                '''
            }
        }
        stage('Nikto Scan') {
            steps {
                sh ' nikto -h http://localhost:3000 '
            }
        }
    }
}